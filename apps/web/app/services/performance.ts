import type {
  PerformancePointDto,
  PerformanceSeriesDto,
} from "../lib/portfolioTypes";
import type { TimelineRange } from "./filter_timeline";

export type PerformanceGainPoint = PerformancePointDto & {
  portfolioGain: number;
};

export const performanceRanges = [
  "1D",
  "1W",
  "1M",
  "3M",
  "6M",
  "YTD",
  "1Y",
  "ALL",
] as const;

export type PerformanceRange = (typeof performanceRanges)[number];

export type AggregatedPerformanceSeries = {
  currency: string;
  points: PerformancePointDto[];
  dataThroughDate: string;
  excludedAccountCount: number;
};

/**
 * Combines only the selected accounts and retains dates for which every
 * account in a currency has a valuation. This prevents a stale account from
 * appearing as a sudden portfolio loss at the end of the chart.
 */
export function buildCompleteCurrencySeries(
  accountSeries: PerformanceSeriesDto[],
  selectedAccountIds: string[]
): AggregatedPerformanceSeries[] {
  const selectedIds = new Set(selectedAccountIds);
  const byCurrency = new Map<string, PerformanceSeriesDto[]>();

  for (const series of accountSeries) {
    if (!selectedIds.has(series.accountId)) continue;
    const rows = byCurrency.get(series.currency) ?? [];
    rows.push(series);
    byCurrency.set(series.currency, rows);
  }

  return [...byCurrency.entries()]
    .flatMap(([currency, seriesGroup]): AggregatedPerformanceSeries[] => {
      const completeAccountSeries = seriesGroup.filter((series) => series.points.length >= 2);
      const excludedAccountCount = seriesGroup.length - completeAccountSeries.length;
      if (completeAccountSeries.length === 0) return [];

      const pointMaps = completeAccountSeries.map(
        (series) => new Map(series.points.map((point) => [point.date, point]))
      );
      const dataThroughDate = completeAccountSeries
        .map((series) => series.points.at(-1)!.date)
        .sort()[0];
      const commonDates = completeAccountSeries[0].points
        .map((point) => point.date)
        .filter(
          (date) =>
            date <= dataThroughDate && pointMaps.every((pointMap) => pointMap.has(date))
        );
      const points = commonDates.map((date) => ({
        date,
        totalValue: pointMaps.reduce(
          (sum, pointMap) => sum + pointMap.get(date)!.totalValue,
          0
        ),
        netExternalCashFlow: pointMaps.reduce(
          (sum, pointMap) => sum + pointMap.get(date)!.netExternalCashFlow,
          0
        ),
      }));

      return points.length >= 2
        ? [{ currency, points, dataThroughDate, excludedAccountCount }]
        : [];
    })
    .sort((left, right) => left.currency.localeCompare(right.currency));
}

/**
 * A gain removes net deposits and withdrawals from the change in value. Both
 * value and cumulative cash flow are rebased to the first visible point so a
 * selected timeframe measures only activity inside that period.
 */
export function buildPortfolioGainPoints(
  points: PerformancePointDto[],
  includeDeposits: boolean
): PerformanceGainPoint[] {
  const startingValue = points[0]?.totalValue ?? 0;
  const startingCashFlow = points[0]?.netExternalCashFlow ?? 0;

  return points.map((point) => ({
    ...point,
    portfolioGain:
      point.totalValue -
      startingValue -
      (includeDeposits
        ? 0
        : point.netExternalCashFlow - startingCashFlow),
  }));
}

export function gainPercent(
  points: PerformancePointDto[],
  includeDeposits: boolean
): number | null {
  if (points.length < 2 || points[0].totalValue <= 0) return null;
  const latestGain = buildPortfolioGainPoints(points, includeDeposits).at(-1)!
    .portfolioGain;
  return (latestGain / points[0].totalValue) * 100;
}

export function filterPerformancePoints(
  points: PerformancePointDto[],
  range: PerformanceRange | TimelineRange
): PerformancePointDto[] {
  if (range === "ALL" || range === "NONE" || points.length < 2) return points;

  const latestDate = parseDate(points.at(-1)!.date);
  const rangeStart = new Date(latestDate);

  if (range === "YTD") {
    rangeStart.setUTCMonth(0, 1);
  } else if (range === "1D") {
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
  } else if (range === "1W") {
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 7);
  } else if (range === "1M") {
    subtractUtcMonths(rangeStart, 1);
  } else if (range === "3M") {
    subtractUtcMonths(rangeStart, 3);
  } else if (range === "6M") {
    subtractUtcMonths(rangeStart, 6);
  } else if (range === "2Y") {
    subtractUtcMonths(rangeStart, 24);
  } else if (range === "5Y") {
    subtractUtcMonths(rangeStart, 60);
  } else {
    subtractUtcMonths(rangeStart, 12);
  }

  let baselineIndex = 0;
  for (let index = 0; index < points.length; index += 1) {
    if (parseDate(points[index].date) <= rangeStart) baselineIndex = index;
    else break;
  }

  return points.slice(baselineIndex);
}

function parseDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function subtractUtcMonths(date: Date, months: number): void {
  const originalDay = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const finalDayOfMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  date.setUTCDate(Math.min(originalDay, finalDayOfMonth));
}
