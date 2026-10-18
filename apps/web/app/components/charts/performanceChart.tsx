"use client";

import {
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatMoney, formatPercent } from "../../lib/formatters";
import type { PerformanceSummaryDto } from "../../lib/portfolioTypes";
import {
  buildCompleteCurrencySeries,
  buildPortfolioGainPoints,
  filterPerformancePoints,
  gainPercent,
} from "../../services/performance";
import type { TimelineRange } from "../../services/filter_timeline";
import { useSessionState } from "../../state/sessionState";
import {
  chartGridColor,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

type PerformanceChartProps = {
  performance: PerformanceSummaryDto | null;
  accountIds: string[];
  timeline: TimelineRange;
};

type DisplaySeries = {
  currency: string;
  dataThroughDate: string;
  excludedAccountCount: number;
  points: ReturnType<typeof buildPortfolioGainPoints>;
  gain: number;
  gainPercent: number | null;
};

export function PerformanceChart({
  performance,
  accountIds,
  timeline,
}: PerformanceChartProps) {
  const [includeDeposits, setIncludeDeposits] = useSessionState(
    "portfolio:performance:include-deposits",
    false
  );
  const [chartMode, setChartMode] = useSessionState<"value" | "returns">(
    "portfolio:performance:mode",
    "returns"
  );

  const displaySeries = (performance
    ? buildCompleteCurrencySeries(performance.series, accountIds)
    : [])
    .flatMap((series): DisplaySeries[] => {
      const filterScopedPoints = filterPerformancePoints(series.points, timeline);
      const visiblePoints = filterScopedPoints;
      if (visiblePoints.length < 2) return [];
      const points = buildPortfolioGainPoints(visiblePoints, includeDeposits);
      return [{
        currency: series.currency,
        dataThroughDate: series.dataThroughDate,
        excludedAccountCount: series.excludedAccountCount,
        points,
        gain: points.at(-1)!.portfolioGain,
        gainPercent: gainPercent(visiblePoints, includeDeposits),
      }];
    });

  if (displaySeries.length === 0) {
    return (
      <section className="app-panel p-5">
        <h2 className="text-lg font-semibold text-foreground">Portfolio performance</h2>
        <p className="mt-4 text-sm text-muted">
          No complete historical values are available for the selected accounts and timeline.
        </p>
      </section>
    );
  }

  const chartRows = mergeChartRows(displaySeries);
  const period = timelineLabel[timeline];

  return (
    <section className="app-panel overflow-hidden p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="sr-only">Portfolio performance</h2>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {displaySeries.map((series) => (
              <HeadlineMetric
                key={series.currency}
                series={series}
                chartMode={chartMode}
                period={period}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            {dataThroughLabel(displaySeries)}
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={includeDeposits}
            onChange={(event) => setIncludeDeposits(event.target.checked)}
          />
          Include deposits
        </label>
      </div>
      <div className="mt-5 h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartRows} margin={{ left: 4, right: 4, top: 12, bottom: 8 }}>
            <XAxis dataKey="displayDate" hide />
            <YAxis hide domain={["auto", "auto"]} />
            {chartMode === "returns" ? (
              <ReferenceLine y={0} stroke={chartGridColor} strokeDasharray="4 4" />
            ) : null}
            <Tooltip
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => {
                const currency = String(name).split(" ")[0];
                return [
                  chartMode === "returns"
                    ? formatSignedMoney(Number(value), currency)
                    : formatMoney({ amount: Number(value), currency }),
                  name,
                ];
              }}
            />
            {displaySeries.map((series) => (
              <Line
                key={series.currency}
                type="monotone"
                dataKey={`${series.currency}:${chartMode}`}
                name={`${series.currency} ${chartMode === "returns" ? "return" : "value"}`}
                stroke={currencyColor(series.currency)}
                strokeWidth={2.25}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-3">
        <div className="inline-flex rounded-lg bg-surface-muted p-1" role="group" aria-label="Chart display">
          <ToggleButton
            label="Value"
            selected={chartMode === "value"}
            onClick={() => setChartMode("value")}
          />
          <ToggleButton
            label="Returns"
            selected={chartMode === "returns"}
            onClick={() => setChartMode("returns")}
          />
        </div>
      </div>
    </section>
  );
}

function HeadlineMetric({
  series,
  chartMode,
  period,
}: {
  series: DisplaySeries;
  chartMode: "value" | "returns";
  period: string;
}) {
  const latest = series.points.at(-1)!;
  const primaryValue = chartMode === "value" ? latest.totalValue : series.gain;
  const primary = chartMode === "value"
    ? formatMoney({ amount: primaryValue, currency: series.currency })
    : formatSignedMoney(primaryValue, series.currency);
  const secondary = chartMode === "value"
    ? `${formatSignedMoney(series.gain, series.currency)} (${formatSignedPercent(series.gainPercent)}) ${period}`
    : `${formatSignedPercent(series.gainPercent)} ${period}`;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: currencyColor(series.currency) }}
          aria-hidden="true"
        />
        <p className={`text-2xl font-semibold tracking-tight sm:text-3xl ${
          chartMode === "returns" ? valueTone(series.gain) : "text-foreground"
        }`}>
          {primary}
        </p>
      </div>
      <p className={`mt-1 text-sm font-semibold ${valueTone(series.gain)}`}>
        {secondary}
      </p>
    </div>
  );
}

function mergeChartRows(seriesRows: DisplaySeries[]): Array<Record<string, string | number>> {
  const rowsByDate = new Map<string, Record<string, string | number>>();

  for (const series of seriesRows) {
    for (const point of series.points) {
      const row = rowsByDate.get(point.date) ?? {
        date: point.date,
        displayDate: formatDate(point.date),
      };
      row[`${series.currency}:value`] = point.totalValue;
      row[`${series.currency}:returns`] = point.portfolioGain;
      rowsByDate.set(point.date, row);
    }
  }

  return [...rowsByDate.values()].sort((left, right) =>
    String(left.date).localeCompare(String(right.date))
  );
}

function ToggleButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        selected
          ? "bg-foreground text-surface"
          : "text-muted hover:bg-surface hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function formatSignedMoney(value: number, currency: string): string {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatMoney({ amount: value, currency })}`;
}

function formatSignedPercent(value: number | null): string {
  if (value == null) return "--";
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${prefix}${formatPercent(value)}`;
}

function valueTone(value: number): string {
  if (value > 0) return "text-positive";
  if (value < 0) return "text-negative";
  return "text-foreground";
}

function currencyColor(currency: string): string {
  if (currency === "CAD") return "var(--color-currency-cad)";
  if (currency === "USD") return "var(--color-currency-usd)";
  return "var(--color-chart-series-1)";
}

function dataThroughLabel(series: DisplaySeries[]): string {
  const labels = series.map((row) => {
    const omitted = row.excludedAccountCount > 0
      ? `; ${row.excludedAccountCount} selected account${row.excludedAccountCount === 1 ? "" : "s"} omitted without history`
      : "";
    return `${row.currency} data through ${formatDate(row.dataThroughDate)}${omitted}`;
  });
  return labels.join(" | ");
}

const timelineLabel: Record<TimelineRange, string> = {
  NONE: "all time",
  "1M": "past month",
  "3M": "past 3 months",
  "6M": "past 6 months",
  "1Y": "past year",
  "2Y": "past 2 years",
  "5Y": "past 5 years",
  ALL: "all time",
};
