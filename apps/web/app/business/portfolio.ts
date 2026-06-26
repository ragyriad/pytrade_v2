import { groupMoney } from "./money";
import type { MoneyBreakdownDto, PositionDto } from "../lib/portfolio-types";

export type PositionAllocationSlice = {
  label: string;
  value: number;
  percentage: number;
  currency: string;
};

export function getUnrealizedReturnPercent(position: PositionDto): number | null {
  const pnl = position.unrealizedGainLoss?.amount;
  if (pnl == null) return null;

  const costBasis = position.marketValue.amount - pnl;
  if (costBasis === 0) return null;

  return (pnl / costBasis) * 100;
}

export function getTotalMarketValue(positions: PositionDto[]): MoneyBreakdownDto[] {
  return groupMoney(positions.map((position) => position.marketValue));
}

export function getTotalUnrealized(positions: PositionDto[]): MoneyBreakdownDto[] {
  return groupMoney(
    positions
      .map((position) => position.unrealizedGainLoss)
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
  );
}

export function getAggregateUnrealizedAmount(positions: PositionDto[]): number {
  return positions.reduce((sum, position) => sum + (position.unrealizedGainLoss?.amount ?? 0), 0);
}

export function getAggregateUnrealizedPercent(positions: PositionDto[]): number | null {
  const marketValue = positions.reduce((sum, position) => sum + position.marketValue.amount, 0);
  const unrealized = getAggregateUnrealizedAmount(positions);
  const costBasis = marketValue - unrealized;

  return costBasis === 0 ? null : (unrealized / costBasis) * 100;
}

export function getCurrentCostBasis(positions: PositionDto[]): number {
  return positions.reduce((sum, position) => {
    const pnl = position.unrealizedGainLoss?.amount ?? 0;
    return sum + (position.marketValue.amount - pnl);
  }, 0);
}

export function buildPositionAllocationSlices(
  positions: PositionDto[]
): PositionAllocationSlice[] {
  const totals = new Map<string, { value: number; currency: string }>();

  for (const position of positions) {
    const current = totals.get(position.symbol);
    totals.set(position.symbol, {
      value: (current?.value ?? 0) + position.marketValue.amount,
      currency: current?.currency ?? position.marketValue.currency,
    });
  }

  const total = Array.from(totals.values()).reduce((sum, row) => sum + row.value, 0);

  return Array.from(totals.entries())
    .map(([label, row]) => ({
      label,
      value: row.value,
      currency: row.currency,
      percentage: total > 0 ? (row.value / total) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}
