import { absoluteMoney, divideMoney, groupMoney } from "./money";
import { annualizationFactor, getMonthDivisor, type TimelineRange } from "./timeline";
import { getCurrentCostBasis } from "./portfolio";
import type { MoneyBreakdownDto, PositionDto, TransactionDto } from "../lib/portfolio-types";

export function getDividendTotals(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(transactions.map((transaction) => absoluteMoney(transaction.amount)));
}

export function getAverageMonthlyDividends(
  transactions: TransactionDto[],
  range: TimelineRange
): MoneyBreakdownDto[] {
  return divideMoney(getDividendTotals(transactions), getMonthDivisor(transactions, range));
}

export function getDividendYieldOnCostPercent(
  transactions: TransactionDto[],
  positions: PositionDto[],
  range: TimelineRange
): number | null {
  const costBasis = getCurrentCostBasis(positions);
  if (costBasis === 0) return null;

  const totalDividendAmount = getDividendTotals(transactions).reduce(
    (sum, value) => sum + value.amount,
    0
  );
  const annualizedDividendAmount = totalDividendAmount * annualizationFactor(range, transactions);

  return (annualizedDividendAmount / costBasis) * 100;
}
