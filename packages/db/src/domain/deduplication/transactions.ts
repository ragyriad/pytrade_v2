import {
  canonicalizeSymbol,
  parseOptionContract,
} from "../normalization/index.js";
import { transactionSourcePriority } from "./precedence.js";

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function dateOnly(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime())
    ? String(value).slice(0, 10)
    : parsed.toISOString().slice(0, 10);
}

function normalizedNumber(
  value: string | number | null | undefined,
  scale: number,
  absolute = false
): string {
  if (value == null) return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  const normalized = absolute ? Math.abs(parsed) : parsed;
  return (Object.is(normalized, -0) ? 0 : normalized).toFixed(scale);
}

function identitySymbol(input: {
  symbol?: string | null;
  description?: string | null;
  source?: string | null;
}): string | null {
  const option = parseOptionContract(input.description, input.symbol);
  return canonicalizeSymbol(option?.underlyingSymbol ?? input.symbol, {
    source: input.source,
  });
}

/**
 * Cross-source identity excludes provider transaction type, security type, and
 * database UUIDs. Those values are normalized output, not economic identity.
 */
export function transactionEconomicKey(input: {
  accountId: string;
  tradeDate: Date | string;
  symbol?: string | null;
  description?: string | null;
  source?: string | null;
  amount: string | number;
  units?: string | number | null;
  currencyCode?: string | null;
}): string {
  return [
    input.accountId,
    dateOnly(input.tradeDate),
    identitySymbol(input) ?? "",
    normalizedNumber(input.amount, 2),
    normalizedNumber(input.units, 6, true),
    normalizeText(input.currencyCode),
  ].join("|");
}

export type StoredTransactionLike = {
  id: string;
  accountId: string;
  source?: string | null;
  snaptradeTransactionId?: string | null;
  externalTransactionId?: string | null;
  tradeDate: Date | string;
  settlementDate?: Date | string | null;
  type?: string | null;
  action?: string | null;
  description?: string | null;
  amount: string | number;
  units?: string | number | null;
  price?: string | number | null;
  fee?: string | number | null;
  currencyCode?: string | null;
  symbol?: string | null;
  createdAt?: Date | string | null;
  securityId?: string | null;
};

function exactProviderFingerprint(transaction: StoredTransactionLike): string {
  return [
    transaction.accountId,
    normalizeText(transaction.source),
    dateOnly(transaction.tradeDate),
    transaction.settlementDate ? dateOnly(transaction.settlementDate) : "",
    normalizeText(transaction.externalTransactionId),
    normalizeText(transaction.type ?? transaction.action),
    normalizeText(transaction.description),
    normalizedNumber(transaction.amount, 2),
    normalizeText(transaction.currencyCode),
    identitySymbol(transaction) ?? "",
    normalizedNumber(transaction.units, 6),
    normalizedNumber(transaction.price, 6),
    normalizedNumber(transaction.fee, 4),
  ].join("|");
}

export type DuplicateDecision = {
  keeperId: string;
  duplicateId: string;
  confidence: "EXACT_PROVIDER" | "EXACT_CROSS_SOURCE";
  reason: string;
};

export function preferredTransaction(
  left: StoredTransactionLike,
  right: StoredTransactionLike
): StoredTransactionLike {
  const priorityDifference =
    transactionSourcePriority(left.source) -
    transactionSourcePriority(right.source);
  if (priorityDifference !== 0) return priorityDifference > 0 ? left : right;

  const quality = (value: StoredTransactionLike) =>
    (value.snaptradeTransactionId ? 4 : 0) +
    (value.externalTransactionId ? 2 : 0) +
    (value.securityId ? 1 : 0);
  const qualityDifference = quality(left) - quality(right);
  if (qualityDifference !== 0) return qualityDifference > 0 ? left : right;
  return stableWinner(left, right);
}

function stableWinner(left: StoredTransactionLike, right: StoredTransactionLike) {
  const leftDate = left.createdAt ? new Date(left.createdAt).getTime() : 0;
  const rightDate = right.createdAt ? new Date(right.createdAt).getTime() : 0;
  if (leftDate !== rightDate) return leftDate <= rightDate ? left : right;
  return left.id.localeCompare(right.id) <= 0 ? left : right;
}

/**
 * Finds exact duplicates emitted by one provider under different UUIDs.
 * Signed amounts and units remain in the fingerprint, protecting reversals.
 */
export function planExactProviderDuplicateArchives(
  transactions: StoredTransactionLike[]
): string[] {
  const keepers = new Map<string, StoredTransactionLike>();
  const duplicates = new Set<string>();

  for (const transaction of transactions) {
    const key = exactProviderFingerprint(transaction);
    const current = keepers.get(key);
    if (!current) {
      keepers.set(key, transaction);
      continue;
    }
    const winner = stableWinner(current, transaction);
    const duplicate = winner.id === current.id ? transaction : current;
    keepers.set(key, winner);
    duplicates.add(duplicate.id);
    duplicates.delete(winner.id);
  }

  return [...duplicates];
}

export function planStoredTransactionDuplicates(
  transactions: StoredTransactionLike[]
): DuplicateDecision[] {
  const decisions: DuplicateDecision[] = [];
  const exactDuplicateIds = new Set(
    planExactProviderDuplicateArchives(transactions)
  );
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));

  for (const duplicateId of exactDuplicateIds) {
    const duplicate = byId.get(duplicateId)!;
    const key = exactProviderFingerprint(duplicate);
    const keeper = transactions
      .filter(
        (candidate) =>
          candidate.id !== duplicateId &&
          !exactDuplicateIds.has(candidate.id) &&
          exactProviderFingerprint(candidate) === key
      )
      .sort((left, right) =>
        stableWinner(left, right).id === left.id ? -1 : 1
      )[0];
    if (keeper) {
      decisions.push({
        keeperId: keeper.id,
        duplicateId,
        confidence: "EXACT_PROVIDER",
        reason: "Same provider emitted an identical signed activity under another row ID.",
      });
    }
  }

  const crossSourceGroups = new Map<string, StoredTransactionLike[]>();
  for (const transaction of transactions) {
    if (!identitySymbol(transaction)) continue;
    const dates = [transaction.tradeDate, transaction.settlementDate]
      .filter((value): value is Date | string => Boolean(value));
    for (const date of dates) {
      const key = transactionEconomicKey({
        accountId: transaction.accountId,
        tradeDate: date,
        symbol: transaction.symbol,
        description: transaction.description,
        source: transaction.source,
        amount: transaction.amount,
        units: transaction.units,
        currencyCode: transaction.currencyCode,
      });
      const group = crossSourceGroups.get(key) ?? [];
      if (!group.some((candidate) => candidate.id === transaction.id)) {
        group.push(transaction);
      }
      crossSourceGroups.set(key, group);
    }
  }

  const alreadyArchived = new Set(decisions.map((decision) => decision.duplicateId));
  for (const group of crossSourceGroups.values()) {
    const active = group.filter((transaction) => !alreadyArchived.has(transaction.id));
    if (new Set(active.map((transaction) => transaction.source)).size < 2) continue;
    const keeper = active.reduce(preferredTransaction);
    for (const duplicate of active) {
      if (duplicate.id === keeper.id || duplicate.source === keeper.source) continue;
      decisions.push({
        keeperId: keeper.id,
        duplicateId: duplicate.id,
        confidence: "EXACT_CROSS_SOURCE",
        reason:
          "Different sources contain the same account, canonical symbol, date, signed amount, absolute units, and currency.",
      });
      alreadyArchived.add(duplicate.id);
    }
  }

  return decisions;
}
