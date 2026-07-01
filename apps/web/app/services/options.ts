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
    `${transaction.symbol ?? "UNKNOWN"}:${transaction.description ?? "UNKNOWN"}`
  );
}

function signedUnits(transaction: TransactionDto): number {
  const units = transaction.units ?? 0;
  if (units === 0) return 0;

  const action = (transaction.optionAction ?? transaction.action ?? transaction.type).toUpperCase();
  if (action.includes("SELL") && units > 0) return -units;
  return units;
}

function optionExpiration(transaction: TransactionDto): Date | null {
  const match = transaction.description?.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (!match) return null;

  const expiration = new Date(`${match[1]}T23:59:59.999`);
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
  return transaction.assetType?.trim().toUpperCase() === "OPTION";
}

function isOptionPnlAction(transaction: TransactionDto): boolean {
  const action = (transaction.action ?? transaction.type).trim().toUpperCase();
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
    const key = optionKey(transaction);
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return Array.from(groups.values()).filter(isActiveOptionGroup).length;
}

export function buildOptionSecurityRows(transactions: TransactionDto[]): OptionSecurityRow[] {
  const groups = new Map<string, TransactionDto[]>();

  for (const transaction of transactions) {
    const key =
      transaction.underlyingSecurityId ??
      transaction.securityId ??
      transaction.symbol ??
      "UNKNOWN";
    groups.set(key, [...(groups.get(key) ?? []), transaction]);
  }

  return Array.from(groups.entries())
    .map(([id, rows]) => {
      const sortedRows = [...rows].sort(
        (a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
      );
      const tradeDates = rows.map((transaction) => new Date(transaction.tradeDate).getTime());

      return {
        id,
        symbol: rows.find((transaction) => transaction.symbol)?.symbol ?? "Unknown",
        transactionCount: rows.length,
        activeOptionCount: getActiveOptionCount(rows),
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
