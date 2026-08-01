import type {
  MoneyBreakdownDto,
  MoneyDto,
  TransactionDto,
} from "../lib/portfolioTypes";
import { absoluteMoney, groupMoney } from "./value_helpers";

export type CostView = "fees" | "taxes" | "both";
export type CostKind = "fee" | "tax";

export type MonthlyCostRow = {
  month: string;
  label: string;
  [seriesKey: string]: string | number;
};

export type MonthlyCostSeries = {
  key: string;
  label: string;
  currency: string;
  kind: CostKind;
};

const NON_ZERO_THRESHOLD = 0.000001;

function normalizedTransactionText(transaction: TransactionDto): string[] {
  return [transaction.action, transaction.type]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toUpperCase().replace(/[\s-]+/g, "_"));
}

function isDividendTransaction(transaction: TransactionDto): boolean {
  return normalizedTransactionText(transaction).some((value) => value.includes("DIVIDEND"));
}

function isTradeTransaction(transaction: TransactionDto): boolean {
  return normalizedTransactionText(transaction).some((value) =>
    /(?:^|_)(?:BUY|SELL|BOUGHT|SOLD)(?:_|$)/.test(value)
  );
}

export function isTaxTransaction(transaction: TransactionDto): boolean {
  const classifications = normalizedTransactionText(transaction);

  if (
    classifications.some(
      (value) =>
        value === "TAX" ||
        value === "WITHHOLDING_TAX" ||
        value === "WITHHELD_TAX" ||
        value === "NON_RESIDENT_TAX" ||
        value === "FOREIGN_TAX" ||
        value === "HST"
    )
  ) {
    return true;
  }

  // Security names and trade descriptions can contain tax-related words. A
  // BUY/SELL must not become a tax row based on description text alone.
  if (isTradeTransaction(transaction)) return false;

  const description = transaction.description?.toUpperCase() ?? "";
  return /\b(?:TAX|WITHHOLD(?:ING|HELD)|NON-RES(?:IDENT)?\s+TAX|HST)\b/.test(description);
}

export function isFeeTransaction(transaction: TransactionDto): boolean {
  if (isTaxTransaction(transaction)) return false;
  if (Math.abs(transaction.fee.amount) > NON_ZERO_THRESHOLD) return true;
  if (isTradeTransaction(transaction)) return false;

  const classifications = normalizedTransactionText(transaction);
  const explicitlyClassifiedAsFee = classifications.some(
    (value) =>
      value === "FEE" ||
      value.endsWith("_FEE") ||
      value === "COMMISSION" ||
      value === "REBATE"
  );

  if (explicitlyClassifiedAsFee) return true;

  return false;
}

export function getFeeMoney(transaction: TransactionDto): MoneyDto {
  const value =
    Math.abs(transaction.fee.amount) > NON_ZERO_THRESHOLD
      ? transaction.fee
      : transaction.amount;
  return absoluteMoney(value);
}

export function getTaxMoney(transaction: TransactionDto): MoneyDto {
  return absoluteMoney(transaction.amount);
}

export function getCostKinds(transaction: TransactionDto): CostKind[] {
  const kinds: CostKind[] = [];
  if (isFeeTransaction(transaction)) kinds.push("fee");
  if (isTaxTransaction(transaction)) kinds.push("tax");
  return kinds;
}

export function getCostTypeLabel(transaction: TransactionDto): string {
  const kinds = getCostKinds(transaction);
  if (kinds.length === 2) return "Fee + Tax";
  if (kinds[0] === "fee") return "Fee";
  if (kinds[0] === "tax") return "Tax";
  return "Other";
}

export function filterCostTransactions(
  transactions: TransactionDto[],
  view: CostView
): TransactionDto[] {
  return transactions.filter((transaction) => {
    if (isDividendTransaction(transaction)) return false;

    const fee = isFeeTransaction(transaction);
    const tax = isTaxTransaction(transaction);

    if (view === "fees") return fee;
    if (view === "taxes") return tax;
    return fee || tax;
  });
}

export function getFeeTotals(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(
    transactions.filter(isFeeTransaction).map((transaction) => getFeeMoney(transaction))
  );
}

export function getTaxTotals(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(
    transactions.filter(isTaxTransaction).map((transaction) => getTaxMoney(transaction))
  );
}

export function buildMonthlyCostRows(transactions: TransactionDto[]): {
  series: MonthlyCostSeries[];
  rows: MonthlyCostRow[];
} {
  const months = new Map<string, Map<string, number>>();
  const seriesByKey = new Map<string, MonthlyCostSeries>();

  const addValue = (month: string, kind: CostKind, value: MoneyDto) => {
    const currency = value.currency || "USD";
    // Recharts resolves string data keys as property paths. Keep these keys free
    // of path-like punctuation so the bar can reliably read the row value.
    const key = `${kind}_${currency.replace(/[^A-Za-z0-9_]/g, "_")}`;
    const label = `${kind === "fee" ? "Fees" : "Taxes"} (${currency})`;
    const monthTotals = months.get(month) ?? new Map<string, number>();

    monthTotals.set(key, (monthTotals.get(key) ?? 0) + Math.abs(value.amount));
    months.set(month, monthTotals);
    seriesByKey.set(key, { key, label, currency, kind });
  };

  for (const transaction of transactions) {
    const date = new Date(transaction.tradeDate);
    if (Number.isNaN(date.getTime())) continue;

    const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    if (isFeeTransaction(transaction)) addValue(month, "fee", getFeeMoney(transaction));
    if (isTaxTransaction(transaction)) addValue(month, "tax", getTaxMoney(transaction));
  }

  const series = Array.from(seriesByKey.values()).sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.currency.localeCompare(b.currency)
  );
  const rows = Array.from(months.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => {
      const row: MonthlyCostRow = { month, label: month };
      for (const item of series) row[item.key] = totals.get(item.key) ?? 0;
      return row;
    });

  return { series, rows };
}
