import { absoluteMoney, groupMoney } from "./value_helpers";
import type { MoneyBreakdownDto, TransactionDto } from "../lib/portfolio-types";

export type MonthlyFeeRow = {
  month: string;
  label: string;
  [currency: string]: string | number;
};

export function getFeeTotals(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(transactions.map((transaction) => absoluteMoney(transaction.fee)));
}

export function buildMonthlyFeeRows(transactions: TransactionDto[]): {
  currencies: string[];
  rows: MonthlyFeeRow[];
} {
  const months = new Map<string, Map<string, number>>();

  for (const transaction of transactions) {
    const date = new Date(transaction.tradeDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const currencyTotals = months.get(key) ?? new Map<string, number>();
    currencyTotals.set(
      transaction.fee.currency,
      (currencyTotals.get(transaction.fee.currency) ?? 0) + Math.abs(transaction.fee.amount)
    );
    months.set(key, currencyTotals);
  }

  const currencies = Array.from(
    new Set(
      Array.from(months.values()).flatMap((currencyTotals) =>
        Array.from(currencyTotals.keys())
      )
    )
  ).sort();

  const rows = Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, currencyTotals]) => {
      const row: MonthlyFeeRow = {
        month,
        label: month,
      };

      for (const currency of currencies) {
        row[currency] = currencyTotals.get(currency) ?? 0;
      }

      return row;
    });

  return { currencies, rows };
}
