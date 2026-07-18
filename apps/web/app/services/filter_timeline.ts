export type TimelineRange = "NONE" | "1M" | "3M" | "6M" | "1Y" | "2Y" | "5Y" | "ALL";

type TimelineTransaction = {
  tradeDate: string;
};

export const timelineOptions: Array<{ value: TimelineRange; label: string }> = [
  { value: "3M", label: "3 months" },
  { value: "6M", label: "6 months" },
  { value: "1Y", label: "1 year" },
  { value: "2Y", label: "2 years" },
  { value: "5Y", label: "5 years" },
  { value: "ALL", label: "All" },
];

export function getTimelineStart<T extends TimelineTransaction>(
  transactions: T[],
  range: TimelineRange
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

export function filterTransactionsByTimeline<T extends TimelineTransaction>(
  transactions: T[],
  range: TimelineRange
): T[] {
  if (range === "NONE") return transactions;
  const start = getTimelineStart(transactions, range);
  if (!start) return [];
  return transactions.filter((transaction) => new Date(transaction.tradeDate) >= start);
}

export function getMonthDivisor(transactions: TimelineTransaction[], range: TimelineRange): number {
  if (range === "NONE") return getMonthDivisor(transactions, "ALL");
  if (range === "1M") return 1;
  if (range === "3M") return 3;
  if (range === "6M") return 6;
  if (range === "1Y") return 12;
  if (range === "2Y") return 24;
  if (range === "5Y") return 60;
  if (transactions.length === 0) return 1;

  const timestamps = transactions.map((transaction) => new Date(transaction.tradeDate).getTime());
  const start = new Date(Math.min(...timestamps));
  const end = new Date(Math.max(...timestamps));
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 + end.getMonth() - start.getMonth() + 1;

  return Math.max(months, 1);
}

export function annualizationFactor(range: TimelineRange, transactions: TimelineTransaction[]): number {
  const months = getMonthDivisor(transactions, range);
  return months > 0 ? 12 / months : 1;
}
