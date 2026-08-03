import {
  accounts,
  accountValueHistory,
  and,
  asc,
  db,
  eq,
  inArray,
  transactions,
  type Account,
  type Transaction,
} from "@repo/db";

type Lot = {
  units: number;
  costBasis: number;
};

type GainBucket = {
  year: number;
  accountId: string;
  accountName: string;
  brokerageName: string | null;
  accountType: string | null;
  currency: string;
  realizedGain: number;
  dividendIncome: number;
  interestIncome: number;
  feeExpense: number;
  tradingFees: number;
  netGain: number;
  sellProceeds: number;
  costBasisSold: number;
  unmatchedSellUnits: number;
};

export type AnnualAccountGainDto = GainBucket;

export type AnnualAccountGainsResponseDto = {
  rows: AnnualAccountGainDto[];
};

export type PerformancePointDto = {
  date: string;
  totalValue: number;
  netExternalCashFlow: number;
};

export type PerformanceSeriesDto = {
  currency: string;
  points: PerformancePointDto[];
};

export type PerformanceSummaryDto = {
  series: PerformanceSeriesDto[];
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateOnly(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : new Date(value).toISOString().slice(0, 10);
}

function externalCashFlow(transaction: Transaction): number | null {
  const action = actionFor(transaction);
  const amount = Math.abs(toNumber(transaction.amount));
  if (!amount) return null;
  if (action === "DEPOSIT" || action === "CONTRIBUTION") return amount;
  if (action === "WITHDRAWAL") return -amount;
  return null;
}

function isInvestmentAccount(account: Account): boolean {
  const classification = [
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType,
    account.name,
    account.brokerageName,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return ![
    "MSB",
    "CASH",
    "CREDIT",
    "CARD",
  ].some((term) => classification.includes(term));
}

export async function getPerformanceSummary(
  requestedUserId: string
): Promise<PerformanceSummaryDto | null> {
  const accountRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, requestedUserId), eq(accounts.isArchived, false)));
  const accountIds = accountRows.filter(isInvestmentAccount).map((account) => account.id);
  if (accountIds.length === 0) return null;

  const historyRows = await db
    .select()
    .from(accountValueHistory)
    .where(inArray(accountValueHistory.accountId, accountIds))
    .orderBy(asc(accountValueHistory.valueDate), asc(accountValueHistory.accountId));
  if (historyRows.length < 2) return null;

  const transactionRows = await db
    .select()
    .from(transactions)
    .where(and(inArray(transactions.accountId, accountIds), eq(transactions.isArchived, false)));
  const currencies = [...new Set(historyRows.map((row) => row.currencyCode))]
    .filter((currency) => currency === "CAD" || currency === "USD")
    .sort((left, right) => left.localeCompare(right));

  const series = currencies.flatMap((currency): PerformanceSeriesDto[] => {
    const totalByDate = new Map<string, number>();
    for (const row of historyRows) {
      if (row.currencyCode !== currency) continue;
      totalByDate.set(row.valueDate, (totalByDate.get(row.valueDate) ?? 0) + toNumber(row.totalValue));
    }
    const values = [...totalByDate.entries()]
      .map(([date, totalValue]) => ({ date, totalValue }))
      .sort((left, right) => left.date.localeCompare(right.date));
    if (values.length < 2 || values[0].totalValue <= 0) return [];

    const cashFlowsByDate = new Map<string, number>();
    for (const transaction of transactionRows) {
      if (transaction.currencyCode !== currency) continue;
      const flow = externalCashFlow(transaction);
      if (flow == null) continue;
      const date = toDateOnly(transaction.tradeDate);
      cashFlowsByDate.set(date, (cashFlowsByDate.get(date) ?? 0) + flow);
    }

    let netExternalCashFlow = 0;
    const points = values.map((value, index): PerformancePointDto => {
      if (index > 0) netExternalCashFlow += cashFlowsByDate.get(value.date) ?? 0;
      return { ...value, netExternalCashFlow };
    });
    return [{ currency, points }];
  });

  return series.length > 0 ? { series } : null;
}

function actionFor(transaction: Transaction): string {
  return (transaction.action ?? transaction.type).toUpperCase();
}

function yearFor(transaction: Transaction): number {
  return new Date(transaction.tradeDate).getUTCFullYear();
}

function securityKeyFor(transaction: Transaction): string {
  return (
    transaction.underlyingSecurityId ??
    transaction.securityId ??
    transaction.symbol ??
    "UNKNOWN"
  );
}

function isBuy(transaction: Transaction): boolean {
  return actionFor(transaction).includes("BUY");
}

function isSell(transaction: Transaction): boolean {
  return actionFor(transaction).includes("SELL");
}

function isDividend(transaction: Transaction): boolean {
  return actionFor(transaction).includes("DIVIDEND");
}

function isInterest(transaction: Transaction): boolean {
  return actionFor(transaction).includes("INTEREST");
}

function isFee(transaction: Transaction): boolean {
  return actionFor(transaction).includes("FEE");
}

function getBucket(
  buckets: Map<string, GainBucket>,
  transaction: Transaction,
  account: Account
): GainBucket {
  const currency = transaction.currencyCode ?? account.accountCurrency ?? "USD";
  const year = yearFor(transaction);
  const key = `${year}:${transaction.accountId}:${currency}`;
  const existing = buckets.get(key);

  if (existing) return existing;

  const bucket: GainBucket = {
    year,
    accountId: transaction.accountId,
    accountName: account.name ?? account.brokerageAccountNumber ?? "Account",
    brokerageName: account.brokerageName,
    accountType: account.type,
    currency,
    realizedGain: 0,
    dividendIncome: 0,
    interestIncome: 0,
    feeExpense: 0,
    tradingFees: 0,
    netGain: 0,
    sellProceeds: 0,
    costBasisSold: 0,
    unmatchedSellUnits: 0,
  };

  buckets.set(key, bucket);
  return bucket;
}

function consumeLots(
  lots: Lot[],
  sellUnits: number
): { costBasis: number; unmatchedUnits: number } {
  let remainingUnits = sellUnits;
  let costBasis = 0;

  while (remainingUnits > 0 && lots.length > 0) {
    const lot = lots[0];
    const consumedUnits = Math.min(remainingUnits, lot.units);
    const consumedCostBasis = (consumedUnits / lot.units) * lot.costBasis;

    costBasis += consumedCostBasis;
    lot.units -= consumedUnits;
    lot.costBasis -= consumedCostBasis;
    remainingUnits -= consumedUnits;

    if (lot.units <= 0.000001) lots.shift();
  }

  return {
    costBasis,
    unmatchedUnits: remainingUnits,
  };
}

export async function getAnnualAccountGains(
  requestedUserId: string
): Promise<AnnualAccountGainsResponseDto | null> {
  const accountRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, requestedUserId), eq(accounts.isArchived, false)));
  const accountIds = accountRows.map((account) => account.id);
  if (accountIds.length === 0) return { rows: [] };

  const transactionRows = await db
    .select()
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        eq(transactions.isArchived, false)
      )
    )
    .orderBy(transactions.tradeDate);

  const accountById = new Map(accountRows.map((account) => [account.id, account]));
  const lotsByAccountSecurityCurrency = new Map<string, Lot[]>();
  const buckets = new Map<string, GainBucket>();

  for (const transaction of transactionRows) {
    if (transaction.isArchived) continue;

    const account = accountById.get(transaction.accountId);
    if (!account) continue;

    const fee = Math.abs(toNumber(transaction.fee));
    const units = Math.abs(toNumber(transaction.units));
    const amount = Math.abs(toNumber(transaction.amount));
    const buy = isBuy(transaction);
    const sell = isSell(transaction);
    const dividend = isDividend(transaction);
    const interest = isInterest(transaction);
    const standaloneFee = isFee(transaction);

    if (!buy && !sell && !dividend && !interest && !standaloneFee && fee === 0) {
      continue;
    }

    const bucket = getBucket(buckets, transaction, account);
    const currency = transaction.currencyCode ?? account.accountCurrency ?? "USD";
    const lotKey = `${transaction.accountId}:${securityKeyFor(transaction)}:${currency}`;
    const lots = lotsByAccountSecurityCurrency.get(lotKey) ?? [];

    bucket.tradingFees += fee;

    if (buy && units > 0) {
      lots.push({
        units,
        costBasis: amount + fee,
      });
      lotsByAccountSecurityCurrency.set(lotKey, lots);
      continue;
    }

    if (sell && units > 0) {
      const sellProceeds = Math.max(amount - fee, 0);
      const consumed = consumeLots(lots, units);
      const realizedGain = sellProceeds - consumed.costBasis;

      bucket.sellProceeds += sellProceeds;
      bucket.costBasisSold += consumed.costBasis;
      bucket.realizedGain += realizedGain;
      bucket.unmatchedSellUnits += consumed.unmatchedUnits;
      continue;
    }

    if (dividend) {
      bucket.dividendIncome += amount;
      continue;
    }

    if (interest) {
      bucket.interestIncome += amount;
      continue;
    }

    if (standaloneFee) {
      bucket.feeExpense += amount + fee;
    }
  }

  const rows = [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      netGain:
        bucket.realizedGain +
        bucket.dividendIncome +
        bucket.interestIncome -
        bucket.feeExpense,
    }))
    .sort(
      (a, b) =>
        b.year - a.year ||
        a.accountName.localeCompare(b.accountName) ||
        a.currency.localeCompare(b.currency)
    );

  return { rows };
}
