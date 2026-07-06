import {
  db,
  getDividendEventsBySecurities,
  getLatestSecurityPriceSnapshots,
  type DividendEvent,
  type SecurityPriceSnapshot,
} from "@repo/db";
import type { MoneyBreakdownDto, MoneyDto } from "../shared/money.js";
import {
  getPortfolioDashboard,
  type AccountDto,
  type PositionDto,
  type TransactionDto,
} from "./portfolio.js";

export type DividendTimelineRange =
  | "NONE"
  | "1M"
  | "3M"
  | "6M"
  | "1Y"
  | "2Y"
  | "5Y"
  | "ALL";

export type PercentBreakdownDto = {
  currency: string;
  percent: number | null;
};

export type DividendAccountShareDto = {
  id: string;
  label: string;
  value: number;
  percentage: number;
  currency: string;
};

export type DividendAccountShareGroupDto = {
  currency: string;
  total: number;
  rows: DividendAccountShareDto[];
};

export type DividendPositionYieldDto = {
  id: string;
  symbol: string;
  description: string | null;
  accountId: string | null;
  units: number;
  accountSegments: Array<{
    accountId: string;
    dividendAmount: MoneyBreakdownDto;
  }>;
  dividendAmount: MoneyBreakdownDto;
  annualizedDividendAmount: MoneyBreakdownDto;
  marketValue: MoneyBreakdownDto;
  costBasis: MoneyBreakdownDto;
  costPerUnit: MoneyBreakdownDto;
  dividendPerShare: MoneyBreakdownDto;
  annualizedDividendPerShare: MoneyBreakdownDto;
  yieldOnCostPercent: number;
};

export type DividendYieldingPositionDto = {
  id: string;
  symbol: string;
  description: string | null;
  accountId: string;
  status: "open" | "closed";
  totalDividends: MoneyBreakdownDto;
  currentYieldPercent: number | null;
  yieldOnCostPercent: number | null;
};

export type DividendCalendarEventDto = {
  id: string;
  securityId: string | null;
  symbol: string;
  providerTicker: string;
  source: string;
  cashAmount: MoneyBreakdownDto;
  exDate: string;
  paymentDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  frequency: string | null;
  distributionType: string | null;
  isSpecial: boolean;
};

export type DividendSummaryMetricsDto = {
  totalDividends: MoneyBreakdownDto[];
  annualIncome: MoneyBreakdownDto[];
  monthlyIncome: MoneyBreakdownDto[];
  currentYieldByCurrency: PercentBreakdownDto[];
  yieldOnCostByCurrency: PercentBreakdownDto[];
};

export type DividendDashboardSummaryDto = {
  timeline: DividendTimelineRange;
  metrics: DividendSummaryMetricsDto;
  accountShareGroups: DividendAccountShareGroupDto[];
  positionYields: DividendPositionYieldDto[];
  positionRows: DividendYieldingPositionDto[];
  transactions: TransactionDto[];
  calendarEvents: DividendCalendarEventDto[];
};

export type DividendSummaryOptions = {
  userId?: string;
  accountIds?: string[];
  timeline: DividendTimelineRange;
};

type TransactionsByDividendKey = Map<string, TransactionDto[]>;

type DividendRate = {
  annualDividendPerShare: number;
  currency: string | null;
};

type BuyCostBasis = {
  costPerUnit: number | null;
  buyUnits: number;
  sellUnits: number;
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

function normalizeAccountType(type: string | null | undefined): string {
  const normalized = type?.toLowerCase().replace(/[_-]/g, " ") ?? "";

  if (normalized.includes("tfsa")) return "TFSA";
  if (normalized.includes("fhsa")) return "FHSA";
  if (normalized.includes("rrsp")) return "RRSP";
  if (normalized.includes("non registered")) return "Non registered";
  if (normalized.includes("cash") || normalized.includes("msb")) return "Non registered";

  return type?.trim() || "Other";
}

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function padDatePart(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    return [
      value.getFullYear(),
      padDatePart(value.getMonth() + 1),
      padDatePart(value.getDate()),
    ].join("-");
  }

  return String(value).slice(0, 10);
}

function getAnnualDividendRate(events: DividendEvent[]): DividendRate | null {
  const regularEvents = events
    .filter((event) => {
      const frequency = event.frequency?.toLowerCase();
      return !event.isSpecial && frequency !== "ir" && frequency !== "f" && frequency !== "c";
    })
    .sort((a, b) => String(b.exDate).localeCompare(String(a.exDate)));

  if (regularEvents.length === 0) return null;

  const latest = regularEvents[0];
  const frequency = latest.frequency?.toLowerCase() ?? null;
  const multiplier = frequency ? frequencyMultipliers[frequency] : undefined;
  const currency = latest.currencyCode ?? null;

  if (multiplier) {
    return {
      annualDividendPerShare: toNumber(latest.cashAmount) * multiplier,
      currency,
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

  return trailingAnnual > 0
    ? {
        annualDividendPerShare: trailingAnnual,
        currency,
      }
    : null;
}

function emptySummary(timeline: DividendTimelineRange): DividendDashboardSummaryDto {
  return {
    timeline,
    metrics: {
      totalDividends: [],
      annualIncome: [],
      monthlyIncome: [],
      currentYieldByCurrency: [],
      yieldOnCostByCurrency: [],
    },
    accountShareGroups: [],
    positionYields: [],
    positionRows: [],
    transactions: [],
    calendarEvents: [],
  };
}

function isActiveAccount(account: AccountDto | undefined): boolean {
  if (!account?.status) return true;
  return ["active", "open"].includes(account.status.toLowerCase());
}

function absoluteMoney(value: MoneyDto): MoneyDto {
  return {
    ...value,
    amount: Math.abs(value.amount),
  };
}

function groupMoney(values: MoneyDto[]): MoneyBreakdownDto[] {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

function divideMoney(values: MoneyBreakdownDto[], divisor: number): MoneyBreakdownDto[] {
  return values.map((value) => ({
    currency: value.currency,
    amount: divisor === 0 ? 0 : value.amount / divisor,
  }));
}

function getTimelineStart(
  transactions: TransactionDto[],
  range: DividendTimelineRange
): Date | null {
  if (transactions.length === 0) return null;
  if (range === "NONE") return null;

  const latest = new Date(
    Math.max(...transactions.map((transaction) => new Date(transaction.tradeDate).getTime()))
  );

  if (range === "ALL") {
    return new Date(
      Math.min(...transactions.map((transaction) => new Date(transaction.tradeDate).getTime()))
    );
  }

  const start = new Date(latest);

  if (range === "1M") start.setMonth(start.getMonth() - 1);
  if (range === "3M") start.setMonth(start.getMonth() - 3);
  if (range === "6M") start.setMonth(start.getMonth() - 6);
  if (range === "1Y") start.setFullYear(start.getFullYear() - 1);
  if (range === "2Y") start.setFullYear(start.getFullYear() - 2);
  if (range === "5Y") start.setFullYear(start.getFullYear() - 5);

  return start;
}

function filterTransactionsByTimeline(
  transactions: TransactionDto[],
  range: DividendTimelineRange
): TransactionDto[] {
  if (range === "NONE") return transactions;
  const start = getTimelineStart(transactions, range);
  if (!start) return [];
  return transactions.filter((transaction) => new Date(transaction.tradeDate) >= start);
}

function filterDividendEventsByTimeline(
  events: DividendEvent[],
  range: DividendTimelineRange,
  referenceTransactions: TransactionDto[]
): DividendEvent[] {
  if (range === "NONE" || range === "ALL") return events;

  const start = getTimelineStart(referenceTransactions, range);
  if (!start) return events;

  return events.filter((event) => {
    const exDate = toDateOnly(event.exDate);
    return exDate ? new Date(`${exDate}T00:00:00.000Z`) >= start : false;
  });
}

function getPositionCostBasis(position: PositionDto): number {
  if (position.averagePurchasePrice && position.averagePurchasePrice.amount > 0) {
    return position.averagePurchasePrice.amount * position.units;
  }

  return position.marketValue.amount - (position.unrealizedGainLoss?.amount ?? 0);
}

function positionDividendKey(position: Pick<PositionDto, "accountId" | "symbol">): string {
  return `${position.accountId}:${position.symbol.toUpperCase()}`;
}

function transactionDividendKey(
  transaction: Pick<TransactionDto, "accountId" | "symbol">
): string | null {
  if (!transaction.symbol) return null;
  return `${transaction.accountId}:${transaction.symbol.toUpperCase()}`;
}

function transactionDividendCurrencyKey(transaction: TransactionDto): string | null {
  const key = transactionDividendKey(transaction);
  if (!key) return null;
  return `${key}:${transaction.amount.currency}`;
}

function buildTransactionsByDividendKey(
  transactions: TransactionDto[]
): TransactionsByDividendKey {
  const transactionsByKey = new Map<string, TransactionDto[]>();

  for (const transaction of transactions) {
    const key = transactionDividendKey(transaction);
    if (!key) continue;

    transactionsByKey.set(key, [...(transactionsByKey.get(key) ?? []), transaction]);
  }

  return transactionsByKey;
}

function getAverageBuyCostBasis(
  accountId: string,
  symbol: string,
  currency: string,
  transactionsByKey: TransactionsByDividendKey
): BuyCostBasis {
  const key = `${accountId}:${symbol.toUpperCase()}`;
  const transactions = transactionsByKey.get(key) ?? [];
  let buyUnits = 0;
  let sellUnits = 0;
  let totalCost = 0;

  for (const transaction of transactions) {
    if (transaction.amount.currency !== currency) continue;

    const action = (transaction.action ?? transaction.type).toUpperCase();
    if (transaction.units == null) continue;

    const units = Math.abs(transaction.units);
    if (units <= 0) continue;

    if (action.includes("BUY")) {
      buyUnits += units;
      totalCost += Math.abs(transaction.amount.amount) + Math.abs(transaction.fee.amount);
    }

    if (action.includes("SELL")) {
      sellUnits += units;
    }
  }

  return {
    costPerUnit: buyUnits > 0 ? totalCost / buyUnits : null,
    buyUnits,
    sellUnits,
  };
}

function priceFromSnapshot(
  snapshot: SecurityPriceSnapshot,
  fallbackCurrency: string
): MoneyBreakdownDto {
  return {
    amount: toNumber(snapshot.adjustedClose ?? snapshot.close),
    currency: snapshot.currencyCode ?? fallbackCurrency,
  };
}

function buildLatestPricesBySecurityId(
  snapshots: SecurityPriceSnapshot[]
): Map<string, MoneyBreakdownDto> {
  return new Map(
    snapshots.map((snapshot) => [
      snapshot.securityId,
      priceFromSnapshot(snapshot, snapshot.currencyCode ?? "USD"),
    ])
  );
}

function getPriceBySymbol(
  positions: PositionDto[],
  latestPricesBySecurityId: Map<string, MoneyBreakdownDto>
): Map<string, MoneyBreakdownDto> {
  const pricesBySymbol = new Map<string, MoneyBreakdownDto>();

  for (const position of positions) {
    const latestPrice = position.securityId
      ? latestPricesBySecurityId.get(position.securityId)
      : null;
    const price = position.price ?? latestPrice;

    if (!price || price.amount <= 0) continue;
    pricesBySymbol.set(position.symbol.toUpperCase(), price);
  }

  return pricesBySymbol;
}

function combineDividendYieldRows(
  rows: DividendPositionYieldDto[]
): DividendPositionYieldDto[] {
  const rowsBySymbol = new Map<string, DividendPositionYieldDto>();

  for (const row of rows) {
    const key = row.symbol.toUpperCase();
    const current = rowsBySymbol.get(key);

    if (!current) {
      rowsBySymbol.set(key, {
        ...row,
        id: key,
        accountId: null,
      });
      continue;
    }

    const annualizedAmount =
      current.annualizedDividendAmount.amount + row.annualizedDividendAmount.amount;
    const costBasis = current.costBasis.amount + row.costBasis.amount;
    const marketValue = current.marketValue.amount + row.marketValue.amount;
    const dividendAmount = current.dividendAmount.amount + row.dividendAmount.amount;
    const units = current.units + row.units;
    const segmentsByAccount = new Map(
      current.accountSegments.map((segment) => [segment.accountId, segment])
    );

    for (const segment of row.accountSegments) {
      const currentSegment = segmentsByAccount.get(segment.accountId);
      segmentsByAccount.set(segment.accountId, {
        accountId: segment.accountId,
        dividendAmount: {
          amount:
            (currentSegment?.dividendAmount.amount ?? 0) + segment.dividendAmount.amount,
          currency: currentSegment?.dividendAmount.currency ?? segment.dividendAmount.currency,
        },
      });
    }

    rowsBySymbol.set(key, {
      ...current,
      description: current.description ?? row.description,
      units,
      accountSegments: Array.from(segmentsByAccount.values()).sort(
        (a, b) => b.dividendAmount.amount - a.dividendAmount.amount
      ),
      dividendAmount: {
        amount: dividendAmount,
        currency: current.dividendAmount.currency,
      },
      annualizedDividendAmount: {
        amount: annualizedAmount,
        currency: current.annualizedDividendAmount.currency,
      },
      marketValue: {
        amount: marketValue,
        currency: current.marketValue.currency,
      },
      dividendPerShare: {
        amount: units > 0 ? dividendAmount / units : current.dividendPerShare.amount,
        currency: current.dividendPerShare.currency,
      },
      annualizedDividendPerShare: {
        amount:
          units > 0
            ? annualizedAmount / units
            : current.annualizedDividendPerShare.amount,
        currency: current.annualizedDividendPerShare.currency,
      },
      costBasis: {
        amount: costBasis,
        currency: current.costBasis.currency,
      },
      costPerUnit: {
        amount: units > 0 ? costBasis / units : current.costPerUnit.amount,
        currency: current.costPerUnit.currency,
      },
      yieldOnCostPercent: costBasis > 0 ? (annualizedAmount / costBasis) * 100 : 0,
    });
  }

  return Array.from(rowsBySymbol.values()).sort(
    (a, b) => b.dividendAmount.amount - a.dividendAmount.amount
  );
}

function getActiveDividendPositionYields(
  dividendTransactions: TransactionDto[],
  positions: PositionDto[],
  ratesBySecurityId: Map<string, DividendRate>
): DividendPositionYieldDto[] {
  const dividendsByPosition = new Map<string, MoneyBreakdownDto>();
  const positionsByKey = new Map(
    positions.map((position) => [positionDividendKey(position), position])
  );

  for (const transaction of dividendTransactions) {
    const key = transactionDividendKey(transaction);
    if (!key) continue;
    const position = positionsByKey.get(key);
    if (!position) continue;

    const current = dividendsByPosition.get(key);
    const amount = Math.abs(transaction.amount.amount);
    dividendsByPosition.set(key, {
      amount: (current?.amount ?? 0) + amount,
      currency: current?.currency ?? transaction.amount.currency,
    });
  }

  const rows: Array<DividendPositionYieldDto | null> = positions
    .filter((position) => position.units > 0 && !position.isCashEquivalent)
    .map((position) => {
      const dividends = dividendsByPosition.get(positionDividendKey(position));
      const costBasis = getPositionCostBasis(position);
      const dividendRate = position.securityId
        ? ratesBySecurityId.get(position.securityId)
        : null;

      if (
        !dividends ||
        dividends.amount <= 0 ||
        !dividendRate ||
        dividendRate.annualDividendPerShare <= 0 ||
        costBasis <= 0
      ) {
        return null;
      }

      const annualizedPerShare = dividendRate.annualDividendPerShare;
      const annualizedAmount = annualizedPerShare * position.units;
      const dividendCurrency = dividendRate.currency ?? dividends.currency;
      const canCalculateYieldOnCost = dividendCurrency === position.marketValue.currency;

      return {
        id: position.id,
        symbol: position.symbol,
        description: position.description,
        accountId: position.accountId,
        units: position.units,
        accountSegments: [
          {
            accountId: position.accountId,
            dividendAmount: {
              amount: dividends.amount,
              currency: dividends.currency,
            },
          },
        ],
        dividendAmount: {
          amount: dividends.amount,
          currency: dividends.currency,
        },
        annualizedDividendAmount: {
          amount: annualizedAmount,
          currency: dividendCurrency,
        },
        marketValue: position.marketValue,
        dividendPerShare: {
          amount: dividends.amount / position.units,
          currency: dividends.currency,
        },
        annualizedDividendPerShare: {
          amount: annualizedPerShare,
          currency: dividendCurrency,
        },
        costBasis: {
          amount: costBasis,
          currency: position.marketValue.currency,
        },
        costPerUnit: {
          amount: costBasis / position.units,
          currency: position.marketValue.currency,
        },
        yieldOnCostPercent:
          canCalculateYieldOnCost ? (annualizedAmount / costBasis) * 100 : 0,
      };
    });

  return combineDividendYieldRows(
    rows.filter((row): row is DividendPositionYieldDto => row != null)
  );
}

function percentByCurrency(
  rows: DividendPositionYieldDto[],
  denominatorForRow: (row: DividendPositionYieldDto) => MoneyBreakdownDto
): PercentBreakdownDto[] {
  const totals = new Map<string, { income: number; denominator: number }>();

  for (const row of rows) {
    const denominator = denominatorForRow(row);
    if (row.annualizedDividendAmount.currency !== denominator.currency) continue;

    const currency = denominator.currency;
    const current = totals.get(currency) ?? { income: 0, denominator: 0 };

    totals.set(currency, {
      income: current.income + row.annualizedDividendAmount.amount,
      denominator: current.denominator + denominator.amount,
    });
  }

  return [...totals.entries()]
    .map(([currency, value]) => ({
      currency,
      percent:
        value.denominator > 0 ? (value.income / value.denominator) * 100 : null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function getDividendMetrics(
  positionYields: DividendPositionYieldDto[],
  transactions: TransactionDto[]
): DividendSummaryMetricsDto {
  const annualIncome = groupMoney(
    positionYields.map((row) => row.annualizedDividendAmount)
  );

  return {
    totalDividends: groupMoney(
      transactions.map((transaction) => absoluteMoney(transaction.amount))
    ),
    annualIncome,
    monthlyIncome: divideMoney(annualIncome, 12),
    currentYieldByCurrency: percentByCurrency(positionYields, (row) => row.marketValue),
    yieldOnCostByCurrency: percentByCurrency(positionYields, (row) => row.costBasis),
  };
}

function accountDividendLabel(account: AccountDto | undefined): string {
  if (!account) return "Unknown account";

  const accountType = account.type ? normalizeAccountType(account.type) : null;
  const brokerage = account.institutionName?.trim() || account.name.trim();

  return [accountType, brokerage].filter(Boolean).join(" ");
}

function accountNumberKey(account: AccountDto): string {
  return account.brokerageAccountNumber?.trim() || account.id;
}

function buildAccountGroupKeys(accounts: AccountDto[]): Map<string, string> {
  const parent = new Map<string, string>();

  const find = (key: string): string => {
    const current = parent.get(key) ?? key;
    if (current === key) {
      parent.set(key, key);
      return key;
    }

    const root = find(current);
    parent.set(key, root);
    return root;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    const root = [leftRoot, rightRoot].sort()[0];
    parent.set(leftRoot, root);
    parent.set(rightRoot, root);
  };

  for (const account of accounts) {
    const accountNumber = accountNumberKey(account);
    const linkedAccountNumber = account.linkedAccountId?.trim();

    find(accountNumber);
    if (linkedAccountNumber) {
      union(accountNumber, linkedAccountNumber);
    }
  }

  return new Map(accounts.map((account) => [account.id, find(accountNumberKey(account))]));
}

function getDividendAccountShareGroups(
  transactions: TransactionDto[],
  accounts: AccountDto[]
): DividendAccountShareGroupDto[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const accountGroupKeyById = buildAccountGroupKeys(accounts);
  const totals = new Map<
    string,
    { id: string; currency: string; label: string; value: number }
  >();

  for (const transaction of transactions) {
    const value = Math.abs(transaction.amount.amount);
    if (value === 0) continue;

    const account = accountsById.get(transaction.accountId);
    const currency = transaction.amount.currency || "USD";
    const label = accountDividendLabel(account);
    const groupKey = accountGroupKeyById.get(transaction.accountId) ?? transaction.accountId;
    const key = `${groupKey}:${currency}`;
    const current = totals.get(key);

    totals.set(key, {
      id: key,
      currency,
      label,
      value: (current?.value ?? 0) + value,
    });
  }

  const totalsByCurrency = new Map<string, number>();
  totals.forEach((row) => {
    totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.value);
  });

  const groupsByCurrency = new Map<string, DividendAccountShareDto[]>();
  totals.forEach((row) => {
    const currencyTotal = totalsByCurrency.get(row.currency) ?? 0;
    const current = groupsByCurrency.get(row.currency) ?? [];

    groupsByCurrency.set(row.currency, [
      ...current,
      {
        id: row.id,
        label: row.label,
        value: row.value,
        percentage: currencyTotal > 0 ? (row.value / currencyTotal) * 100 : 0,
        currency: row.currency,
      },
    ]);
  });

  const groups: DividendAccountShareGroupDto[] = [];

  groupsByCurrency.forEach((rows, currency) => {
    groups.push({
      currency,
      total: totalsByCurrency.get(currency) ?? 0,
      rows: rows.sort((a, b) => b.value - a.value),
    });
  });

  return groups.sort((a, b) => a.currency.localeCompare(b.currency));
}

function getDividendYieldingPositionRows(
  dividendTransactions: TransactionDto[],
  transactionsByKey: TransactionsByDividendKey,
  positions: PositionDto[],
  latestPricesBySecurityId: Map<string, MoneyBreakdownDto>,
  ratesBySecurityId: Map<string, DividendRate>
): DividendYieldingPositionDto[] {
  const positionsByKey = new Map(
    positions.map((position) => [positionDividendKey(position), position])
  );
  const pricesBySymbol = getPriceBySymbol(positions, latestPricesBySecurityId);
  const rowsByKey = new Map<
    string,
    {
      accountId: string;
      securityId: string | null;
      symbol: string;
      description: string | null;
      currency: string;
      totalDividends: number;
    }
  >();

  for (const transaction of dividendTransactions) {
    const key = transactionDividendCurrencyKey(transaction);
    if (!key || !transaction.symbol) continue;

    const current = rowsByKey.get(key);
    const amount = Math.abs(transaction.amount.amount);

    rowsByKey.set(key, {
      accountId: transaction.accountId,
      securityId: current?.securityId ?? transaction.securityId,
      symbol: transaction.symbol,
      description: current?.description ?? transaction.description,
      currency: transaction.amount.currency,
      totalDividends: (current?.totalDividends ?? 0) + amount,
    });
  }

  return Array.from(rowsByKey.values())
    .map((row): DividendYieldingPositionDto => {
      const position = positionsByKey.get(
        `${row.accountId}:${row.symbol.toUpperCase()}`
      );
      const isOpen = Boolean(position && position.units > 0 && !position.isCashEquivalent);
      const securityId = row.securityId ?? position?.securityId ?? null;
      const dividendRate = securityId ? ratesBySecurityId.get(securityId) : null;
      const annualizedDividendPerShare = dividendRate?.annualDividendPerShare ?? null;
      const dividendCurrency = dividendRate?.currency ?? row.currency;
      const currentPrice =
        (securityId ? latestPricesBySecurityId.get(securityId) : null) ??
        position?.price ??
        pricesBySymbol.get(row.symbol.toUpperCase());
      const currentYieldPercent =
        annualizedDividendPerShare != null &&
        currentPrice?.currency === dividendCurrency &&
        currentPrice.amount > 0
            ? (annualizedDividendPerShare / currentPrice.amount) * 100
            : null;
      const buyCostBasis = getAverageBuyCostBasis(
        row.accountId,
        row.symbol,
        row.currency,
        transactionsByKey
      );
      const costPerUnit = isOpen && position
        ? getPositionCostBasis(position) / position.units
        : buyCostBasis.buyUnits > 0 && buyCostBasis.buyUnits >= buyCostBasis.sellUnits
          ? buyCostBasis.costPerUnit
          : null;
      const costCurrency = position?.marketValue.currency ?? row.currency;

      return {
        id: `${row.accountId}:${row.symbol.toUpperCase()}:${row.currency}`,
        symbol: row.symbol,
        description: row.description,
        accountId: row.accountId,
        status: isOpen ? "open" : "closed",
        totalDividends: {
          amount: row.totalDividends,
          currency: row.currency,
        },
        currentYieldPercent,
        yieldOnCostPercent:
          annualizedDividendPerShare != null &&
          dividendCurrency === costCurrency &&
          costPerUnit &&
          costPerUnit > 0
            ? (annualizedDividendPerShare / costPerUnit) * 100
            : null,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return b.totalDividends.amount - a.totalDividends.amount;
    });
}

function toDividendCalendarEventDto(event: DividendEvent): DividendCalendarEventDto {
  return {
    id: event.id,
    securityId: event.securityId,
    symbol: event.symbol,
    providerTicker: event.providerTicker,
    source: event.source,
    cashAmount: {
      amount: toNumber(event.cashAmount),
      currency: event.currencyCode ?? "USD",
    },
    exDate: toDateOnly(event.exDate) ?? "",
    paymentDate: toDateOnly(event.paymentDate),
    recordDate: toDateOnly(event.recordDate),
    declarationDate: toDateOnly(event.declarationDate),
    frequency: event.frequency,
    distributionType: event.distributionType,
    isSpecial: event.isSpecial,
  };
}

async function getLatestPriceSnapshots(
  positions: PositionDto[],
  transactions: TransactionDto[]
): Promise<Map<string, MoneyBreakdownDto>> {
  const securityIds = [
    ...new Set(
      [...positions, ...transactions]
        .map((row) => row.securityId)
        .filter((securityId): securityId is string => Boolean(securityId))
    ),
  ];

  const snapshots = await getLatestSecurityPriceSnapshots(db, securityIds);
  return buildLatestPricesBySecurityId(snapshots);
}

async function getDividendEvents(
  positions: PositionDto[],
  transactions: TransactionDto[]
): Promise<DividendEvent[]> {
  const securityIds = [
    ...new Set(
      [...positions, ...transactions]
        .map((row) => row.securityId)
        .filter((securityId): securityId is string => Boolean(securityId))
    ),
  ];

  return getDividendEventsBySecurities(db, securityIds);
}

function getDividendRates(events: DividendEvent[]): Map<string, DividendRate> {
  const eventsBySecurityId = new Map<string, DividendEvent[]>();

  for (const event of events) {
    if (!event.securityId) continue;
    eventsBySecurityId.set(event.securityId, [
      ...(eventsBySecurityId.get(event.securityId) ?? []),
      event,
    ]);
  }

  const ratesBySecurityId = new Map<string, DividendRate>();

  eventsBySecurityId.forEach((securityEvents, securityId) => {
    const rate = getAnnualDividendRate(securityEvents);
    if (rate && rate.annualDividendPerShare > 0) {
      ratesBySecurityId.set(securityId, rate);
    }
  });

  return ratesBySecurityId;
}

export async function getDividendDashboardSummary(
  options: DividendSummaryOptions
): Promise<DividendDashboardSummaryDto | null> {
  const dashboard = await getPortfolioDashboard(options.userId);
  if (!dashboard) return null;

  const requestedAccountIds =
    options.accountIds == null ? null : new Set(options.accountIds);
  const selectedAccounts = dashboard.accounts.filter((account) =>
    requestedAccountIds == null ? true : requestedAccountIds.has(account.id)
  );
  const selectedAccountIds = new Set(selectedAccounts.map((account) => account.id));

  if (selectedAccountIds.size === 0) {
    return emptySummary(options.timeline);
  }

  const allTransactions = dashboard.transactions.filter(
    (transaction) => !transaction.isArchived && selectedAccountIds.has(transaction.accountId)
  );
  const dividendTransactions = dashboard.dividends.transactions.filter((transaction) =>
    selectedAccountIds.has(transaction.accountId)
  );
  const timelineTransactions = filterTransactionsByTimeline(
    dividendTransactions,
    options.timeline
  );
  const selectedPositions = dashboard.positions.filter((position) =>
    selectedAccountIds.has(position.accountId)
  );
  const selectedAccountsById = new Map(
    selectedAccounts.map((account) => [account.id, account])
  );
  const activePositions = selectedPositions.filter(
    (position) => isActiveAccount(selectedAccountsById.get(position.accountId))
  );
  const latestPricesBySecurityId = await getLatestPriceSnapshots(
    selectedPositions,
    allTransactions
  );
  const dividendEvents = await getDividendEvents(
    selectedPositions,
    allTransactions
  );
  const dividendRatesBySecurityId = getDividendRates(dividendEvents);
  const transactionsByKey = buildTransactionsByDividendKey(allTransactions);
  const positionYields = getActiveDividendPositionYields(
    timelineTransactions,
    activePositions,
    dividendRatesBySecurityId
  );
  const timelineDividendEvents = filterDividendEventsByTimeline(
    dividendEvents,
    options.timeline,
    dividendTransactions
  );

  return {
    timeline: options.timeline,
    metrics: getDividendMetrics(positionYields, timelineTransactions),
    accountShareGroups: getDividendAccountShareGroups(timelineTransactions, selectedAccounts),
    positionYields,
    positionRows: getDividendYieldingPositionRows(
      timelineTransactions,
      transactionsByKey,
      selectedPositions,
      latestPricesBySecurityId,
      dividendRatesBySecurityId
    ),
    transactions: timelineTransactions,
    calendarEvents: timelineDividendEvents.map(toDividendCalendarEventDto),
  };
}
