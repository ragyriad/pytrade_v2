import type { MoneyBreakdownDto, TransactionDto } from "../lib/portfolio-types";
import { groupMoney } from "./value_helpers";

export type OptionSecurityRow = {
  id: string;
  symbol: string;
  transactionCount: number;
  activeOptionCount: number;
  totalFees: MoneyBreakdownDto[];
  totalPnl: MoneyBreakdownDto[];
  firstTradeDate: string | null;
  lastTradeDate: string | null;
  transactions: TransactionDto[];
};

function optionKey(transaction: TransactionDto): string {
  return (
    transaction.optionId ??
    transaction.optionTicker ??
    `${transaction.symbol ?? "UNKNOWN"}:${transaction.description ?? "UNKNOWN"}`
  );
}

function optionAction(transaction: TransactionDto): string {
  return (
    transaction.optionAction?.trim() ||
    transaction.action?.trim() ||
    transaction.type.trim()
  ).toUpperCase();
}

function signedUnits(transaction: TransactionDto): number {
  const units = transaction.units ?? 0;
  if (units === 0) return 0;

  const action = optionAction(transaction);
  const magnitude = Math.abs(units);
  if (action.includes("SELL")) return -magnitude;
  if (action.includes("BUY")) return magnitude;
  return units;
}

function optionExpiration(transaction: TransactionDto): Date | null {
  const expirationDate = transaction.optionExpirationDate;
  if (!expirationDate) return null;

  const expiration = new Date(`${expirationDate}T23:59:59.999`);
  return Number.isNaN(expiration.getTime()) ? null : expiration;
}

function isExpiredOptionGroup(transactions: TransactionDto[], asOf = new Date()): boolean {
  const expirations = transactions
    .map(optionExpiration)
    .filter((expiration): expiration is Date => expiration != null);

  if (expirations.length === 0) return false;

  return expirations.every((expiration) => expiration.getTime() < asOf.getTime());
}

function isActiveOptionGroup(transactions: TransactionDto[]): boolean {
  if (isExpiredOptionGroup(transactions)) return false;

  const units = transactions.reduce((sum, transaction) => sum + signedUnits(transaction), 0);
  return Math.abs(units) > 0.000001;
}

export function isOptionTransaction(transaction: TransactionDto): boolean {
  if (transaction.assetType?.trim().toUpperCase() !== "OPTION") return false;

  const action = optionAction(transaction);
  const isOptionAction =
    action.includes("BUY") ||
    action.includes("SELL") ||
    action.includes("OPEN") ||
    action.includes("CLOSE") ||
    action.includes("EXERCISE") ||
    action.includes("ASSIGN") ||
    action.includes("EXPIR") ||
    action.includes("CORPORATE_ACTION");
  const hasContractIdentity =
    Boolean(transaction.optionId) ||
    Boolean(transaction.optionTicker) ||
    Boolean(transaction.optionAction) ||
    Boolean(transaction.optionExpirationDate);

  return isOptionAction && hasContractIdentity;
}

function isOptionPnlAction(transaction: TransactionDto): boolean {
  const action = optionAction(transaction);
  return action.includes("BUY") || action.includes("SELL");
}

export function getOptionFees(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(
    transactions.map((transaction) => ({
      currency: transaction.fee.currency,
      amount: Math.abs(transaction.fee.amount),
    }))
  );
}

export function getOptionPnl(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(
    transactions
      .filter(isOptionPnlAction)
      .map((transaction) => ({
        currency: transaction.amount.currency,
        amount: transaction.amount.amount,
      }))
  );
}

export function getActiveOptionCount(transactions: TransactionDto[]): number {
  const groups = new Map<string, TransactionDto[]>();

  for (const transaction of transactions) {
    const key = `${transaction.accountId}:${optionKey(transaction)}`;
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return Array.from(groups.values()).filter(isActiveOptionGroup).length;
}

export function buildOptionSecurityRows(
  transactions: TransactionDto[],
  positionTransactions: TransactionDto[] = transactions
): OptionSecurityRow[] {
  const groups = new Map<string, TransactionDto[]>();
  const positionGroups = new Map<string, TransactionDto[]>();

  for (const transaction of transactions) {
    const key =
      transaction.symbol ??
      transaction.underlyingSecurityId ??
      transaction.securityId ??
      "UNKNOWN";
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }
  for (const transaction of positionTransactions) {
    const key =
      transaction.symbol ??
      transaction.underlyingSecurityId ??
      transaction.securityId ??
      "UNKNOWN";
    positionGroups.set(key, [
      ...(positionGroups.get(key) ?? []),
      transaction,
    ]);
  }

  return Array.from(groups.entries())
    .map(([id, rows]) => {
      const sortedRows = [...rows].sort(
        (a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
      );
      const tradeDates = rows.map((transaction) => new Date(transaction.tradeDate).getTime());

      return {
        id:
          rows.find((transaction) => transaction.underlyingSecurityId)
            ?.underlyingSecurityId ??
          rows.find((transaction) => transaction.securityId)?.securityId ??
          id,
        symbol:
          rows.find((transaction) => transaction.symbol)?.symbol ?? "Unknown",
        transactionCount: rows.length,
        activeOptionCount: getActiveOptionCount(positionGroups.get(id) ?? rows),
        totalFees: getOptionFees(rows),
        totalPnl: getOptionPnl(rows),
        firstTradeDate:
          tradeDates.length > 0 ? new Date(Math.min(...tradeDates)).toISOString() : null,
        lastTradeDate:
          tradeDates.length > 0 ? new Date(Math.max(...tradeDates)).toISOString() : null,
        transactions: sortedRows,
      };
    })
    .sort((a, b) => b.transactionCount - a.transactionCount || a.symbol.localeCompare(b.symbol));
}
