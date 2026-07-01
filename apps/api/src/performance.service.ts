import {
  accounts,
  db,
  eq,
  inArray,
  transactions,
  users,
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

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

async function resolveUser(requestedUserId?: string) {
  if (requestedUserId) {
    const rows = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
    if (rows[0]) return rows[0];
  }

  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
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
  requestedUserId?: string
): Promise<AnnualAccountGainsResponseDto | null> {
  const user = await resolveUser(requestedUserId);
  if (!user) return null;

  const accountRows = await db.select().from(accounts).where(eq(accounts.userId, user.id));
  const accountIds = accountRows.map((account) => account.id);
  if (accountIds.length === 0) return { rows: [] };

  const transactionRows = await db
    .select()
    .from(transactions)
    .where(inArray(transactions.accountId, accountIds))
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
