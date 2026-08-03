import type { PerformancePointDto } from "../lib/portfolioTypes";

export type PerformanceGainPoint = PerformancePointDto & {
  portfolioGain: number;
};

/**
 * A gain removes net deposits and withdrawals from the change in value. The
 * first history point is the baseline, so same-day cash flow is already
 * represented in that starting value and is not counted again.
 */
export function buildPortfolioGainPoints(
  points: PerformancePointDto[],
  includeDeposits: boolean
): PerformanceGainPoint[] {
  const startingValue = points[0]?.totalValue ?? 0;

  return points.map((point) => ({
    ...point,
    portfolioGain:
      point.totalValue -
      startingValue -
      (includeDeposits ? 0 : point.netExternalCashFlow),
  }));
}

export function annualizedGainPercent(
  points: PerformancePointDto[],
  includeDeposits: boolean
): number | null {
  if (points.length < 2 || points[0].totalValue <= 0) return null;
  const gainPoints = buildPortfolioGainPoints(points, includeDeposits);
  const first = gainPoints[0];
  const last = gainPoints.at(-1)!;
  const elapsedYears =
    (new Date(`${last.date}T00:00:00.000Z`).getTime() -
      new Date(`${first.date}T00:00:00.000Z`).getTime()) /
    86_400_000 /
    365.25;
  if (elapsedYears <= 0) return null;

  const growthFactor = 1 + last.portfolioGain / first.totalValue;
  if (growthFactor <= 0) return -100;
  return (Math.pow(growthFactor, 1 / elapsedYears) - 1) * 100;
}
