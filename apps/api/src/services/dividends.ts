import {
  accounts,
  and,
  db,
  eq,
  getDividendEventsBySecurity,
  getDividendEventsBySecurities,
  inArray,
  positions,
  securities,
  type DividendEvent,
  type Position,
} from "@repo/db";
import type { MoneyBreakdownDto } from "../shared/money.js";
import { isInvestmentAccount } from "./account_scope.js";

export type DividendIncomeHoldingDto = {
  accountId: string;
  accountName: string;
  brokerageName: string | null;
  accountType: string | null;
  securityId: string | null;
  symbol: string;
  description: string | null;
  units: number;
  currency: string;
  price: number | null;
  averagePurchasePrice: number | null;
  marketValue: number;
  costBasis: number | null;
  annualDividendPerShare: number;
  projectedAnnualIncome: number;
  projectedMonthlyIncome: number;
  currentYieldPercent: number | null;
  yieldOnCostPercent: number | null;
  dividendFrequency: string | null;
  nextExDate: string | null;
  nextPaymentDate: string | null;
  lastExDate: string | null;
  dataStatus: "ok" | "missing_dividend_data" | "missing_price" | "unknown_frequency";
};

export type DividendIncomeSummaryDto = {
  projectedAnnualIncome: MoneyBreakdownDto[];
  projectedMonthlyIncome: MoneyBreakdownDto[];
  currentYieldPercentByCurrency: Array<{ currency: string; percent: number | null }>;
  yieldOnCostPercentByCurrency: Array<{ currency: string; percent: number | null }>;
  holdings: DividendIncomeHoldingDto[];
};

const frequencyMultipliers: Record<string, number> = {
  w: 52,
  bm: 6,
  m: 12,
  tm: 3,
  q: 4,
  sa: 2,
  a: 1,
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getStoredDividendEventsForSecurity(
  securityId: string
): Promise<DividendEvent[]> {
  return getDividendEventsBySecurity(db, securityId);
}

function groupMoney(values: MoneyBreakdownDto[]): MoneyBreakdownDto[] {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function getAnnualDividendPerShare(events: DividendEvent[]): {
  annualDividendPerShare: number;
  frequency: string | null;
  dataStatus: DividendIncomeHoldingDto["dataStatus"];
} {
  if (events.length === 0) {
    return {
      annualDividendPerShare: 0,
      frequency: null,
      dataStatus: "missing_dividend_data",
    };
  }

  const regularEvents = events
    .filter((event) => {
      const frequency = event.frequency?.toLowerCase();
      return !event.isSpecial && frequency !== "ir" && frequency !== "f" && frequency !== "c";
    })
    .sort((a, b) => String(b.exDate).localeCompare(String(a.exDate)));
  const latest = regularEvents[0] ?? events[0];
  const frequency = latest.frequency?.toLowerCase() ?? null;
  const multiplier = frequency ? frequencyMultipliers[frequency] : undefined;

  if (multiplier) {
    return {
      annualDividendPerShare: toNumber(latest.cashAmount) * multiplier,
      frequency,
      dataStatus: "ok",
    };
  }

  const latestDate = new Date(`${String(latest.exDate).slice(0, 10)}T00:00:00.000Z`);
  const trailingStart = new Date(latestDate);
  trailingStart.setUTCFullYear(trailingStart.getUTCFullYear() - 1);

  const trailingAnnual = regularEvents
    .filter((event) => {
      const exDate = new Date(`${String(event.exDate).slice(0, 10)}T00:00:00.000Z`);
      return exDate >= trailingStart && exDate <= latestDate;
    })
    .reduce((sum, event) => sum + toNumber(event.cashAmount), 0);

  return {
    annualDividendPerShare: trailingAnnual,
    frequency,
    dataStatus: trailingAnnual > 0 ? "unknown_frequency" : "missing_dividend_data",
  };
}

function findNextEvent(events: DividendEvent[]): DividendEvent | null {
  const today = todayDateOnly();
  return (
    events
      .filter((event) => String(event.exDate).slice(0, 10) >= today)
      .sort((a, b) => String(a.exDate).localeCompare(String(b.exDate)))[0] ?? null
  );
}

function findLastEvent(events: DividendEvent[]): DividendEvent | null {
  const today = todayDateOnly();
  return (
    events
      .filter((event) => String(event.exDate).slice(0, 10) <= today)
      .sort((a, b) => String(b.exDate).localeCompare(String(a.exDate)))[0] ?? null
  );
}

function marketValueForPosition(position: Position): number {
  return toNumber(position.units) * toNumber(position.price);
}

export async function getDividendIncomeSummary(
  requestedUserId: string
): Promise<DividendIncomeSummaryDto | null> {
  const accountRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, requestedUserId), eq(accounts.isArchived, false)));
  const accountIds = accountRows
    .filter(isInvestmentAccount)
    .map((account) => account.id);
  if (accountIds.length === 0) {
    return {
      projectedAnnualIncome: [],
      projectedMonthlyIncome: [],
      currentYieldPercentByCurrency: [],
      yieldOnCostPercentByCurrency: [],
      holdings: [],
    };
  }

  const positionRows = await db
    .select()
    .from(positions)
    .where(inArray(positions.accountId, accountIds));
  const positionSecurityIds = [
    ...new Set(
      positionRows
        .map((position) => position.securityId)
        .filter((securityId): securityId is string => Boolean(securityId))
    ),
  ];
  const securityRows =
    positionSecurityIds.length === 0
      ? []
      : await db
          .select()
          .from(securities)
          .where(
            and(
              inArray(securities.id, positionSecurityIds),
              eq(securities.isArchived, false)
            )
          );
  const securityById = new Map(securityRows.map((security) => [security.id, security]));
  const dividendRows = await getDividendEventsBySecurities(
    db,
    securityRows.map((security) => security.id)
  );
  const dividendsBySecurityId = new Map<string, DividendEvent[]>();

  for (const event of dividendRows) {
    if (!event.securityId) continue;
    dividendsBySecurityId.set(event.securityId, [
      ...(dividendsBySecurityId.get(event.securityId) ?? []),
      event,
    ]);
  }

  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const holdings = positionRows
    .filter((position) => !(position.cashEquivalent ?? false))
    .map((position): DividendIncomeHoldingDto => {
      const account = accountById.get(position.accountId);
      const security = position.securityId ? securityById.get(position.securityId) ?? null : null;
      const events = security ? dividendsBySecurityId.get(security.id) ?? [] : [];
      const dividendRate = getAnnualDividendPerShare(events);
      const nextEvent = findNextEvent(events);
      const lastEvent = findLastEvent(events);
      const currency = position.currencyCode ?? security?.currencyCode ?? "USD";
      const units = toNumber(position.units);
      const price = position.price == null ? null : toNumber(position.price);
      const averagePurchasePrice =
        position.averagePurchasePrice == null ? null : toNumber(position.averagePurchasePrice);
      const marketValue = marketValueForPosition(position);
      const costBasis =
        averagePurchasePrice == null ? null : averagePurchasePrice * units;
      const projectedAnnualIncome = units * dividendRate.annualDividendPerShare;

      return {
        accountId: position.accountId,
        accountName: account?.name ?? account?.brokerageAccountNumber ?? "Account",
        brokerageName: account?.brokerageName ?? null,
    accountType: account?.subType ?? null,
        securityId: security?.id ?? null,
        symbol: position.symbol,
        description: position.description,
        units,
        currency,
        price,
        averagePurchasePrice,
        marketValue,
        costBasis,
        annualDividendPerShare: dividendRate.annualDividendPerShare,
        projectedAnnualIncome,
        projectedMonthlyIncome: projectedAnnualIncome / 12,
        currentYieldPercent:
          price && price > 0
            ? (dividendRate.annualDividendPerShare / price) * 100
            : null,
        yieldOnCostPercent:
          averagePurchasePrice && averagePurchasePrice > 0
            ? (dividendRate.annualDividendPerShare / averagePurchasePrice) * 100
            : null,
        dividendFrequency: dividendRate.frequency,
        nextExDate: nextEvent ? String(nextEvent.exDate).slice(0, 10) : null,
        nextPaymentDate: nextEvent?.paymentDate
          ? String(nextEvent.paymentDate).slice(0, 10)
          : null,
        lastExDate: lastEvent ? String(lastEvent.exDate).slice(0, 10) : null,
        dataStatus:
          price == null && dividendRate.dataStatus === "ok"
            ? "missing_price"
            : dividendRate.dataStatus,
      };
    })
    .sort((a, b) => b.projectedAnnualIncome - a.projectedAnnualIncome);

  const currentYieldPercentByCurrency = groupMoney(
    holdings.map((holding) => ({
      currency: holding.currency,
      amount: holding.projectedAnnualIncome,
    }))
  ).map((income) => {
    const marketValue = holdings
      .filter((holding) => holding.currency === income.currency)
      .reduce((sum, holding) => sum + holding.marketValue, 0);

    return {
      currency: income.currency,
      percent: marketValue > 0 ? (income.amount / marketValue) * 100 : null,
    };
  });

  const yieldOnCostPercentByCurrency = groupMoney(
    holdings.map((holding) => ({
      currency: holding.currency,
      amount: holding.projectedAnnualIncome,
    }))
  ).map((income) => {
    const costBasis = holdings
      .filter((holding) => holding.currency === income.currency)
      .reduce((sum, holding) => sum + (holding.costBasis ?? 0), 0);

    return {
      currency: income.currency,
      percent: costBasis > 0 ? (income.amount / costBasis) * 100 : null,
    };
  });

  return {
    projectedAnnualIncome: groupMoney(
      holdings.map((holding) => ({
        currency: holding.currency,
        amount: holding.projectedAnnualIncome,
      }))
    ),
    projectedMonthlyIncome: groupMoney(
      holdings.map((holding) => ({
        currency: holding.currency,
        amount: holding.projectedMonthlyIncome,
      }))
    ),
    currentYieldPercentByCurrency,
    yieldOnCostPercentByCurrency,
    holdings,
  };
}
