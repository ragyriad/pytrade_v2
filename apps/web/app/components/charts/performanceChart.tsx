"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatMoney, formatPercent } from "../../lib/formatters";
import type { PerformanceSummaryDto } from "../../lib/portfolioTypes";
import {
  annualizedGainPercent,
  buildPortfolioGainPoints,
} from "../../services/performance";
import {
  chartAxisLine,
  chartAxisTick,
  chartGridColor,
  chartTickLine,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

type PerformanceChartProps = {
  performance: PerformanceSummaryDto | null;
};

export function PerformanceChart({ performance }: PerformanceChartProps) {
  const [includeDeposits, setIncludeDeposits] = useState(false);
  const availableSeries = performance?.series.filter((series) => series.points.length >= 2) ?? [];

  if (availableSeries.length === 0) {
    return (
      <section className="app-panel p-5">
        <h2 className="text-lg font-semibold text-foreground">Portfolio gain</h2>
        <p className="mt-4 text-sm text-muted">
          Historical account values will appear here after a supported account sync.
        </p>
      </section>
    );
  }

  const gainLabel = includeDeposits ? "Change including deposits" : "Gain excluding deposits";

  return (
    <section className="app-panel p-5">
      <div className="border-b border-border pb-4">
        <h2 className="text-lg font-semibold text-foreground">Portfolio gain</h2>
        <p className="mt-1 text-sm text-muted">
          CAD and USD gains are shown separately. Deposits and withdrawals are excluded by default.
        </p>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={includeDeposits}
            onChange={(event) => setIncludeDeposits(event.target.checked)}
          />
          Include deposits
        </label>
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        {availableSeries.map((series) => (
          <CurrencyGainChart
            key={series.currency}
            currency={series.currency}
            points={series.points}
            includeDeposits={includeDeposits}
            gainLabel={gainLabel}
          />
        ))}
      </div>
    </section>
  );
}

function CurrencyGainChart({
  currency,
  points,
  includeDeposits,
  gainLabel,
}: {
  currency: string;
  points: PerformanceSummaryDto["series"][number]["points"];
  includeDeposits: boolean;
  gainLabel: string;
}) {
  const rows = buildPortfolioGainPoints(points, includeDeposits).map((point) => ({
    ...point,
    displayDate: formatDate(point.date),
  }));
  const latestPoint = rows.at(-1)!;
  const annualizedPercent = annualizedGainPercent(points, includeDeposits);

  return (
    <section className="rounded-md border border-border p-4">
      <h3 className="text-base font-semibold text-foreground">{currency} gain</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <MoneyMetric label={gainLabel} value={latestPoint.portfolioGain} currency={currency} />
        <PercentMetric label="Annualized gain/loss" value={annualizedPercent} />
      </div>
      <div className="mt-4 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 8, right: 24, top: 18, bottom: 0 }}>
            <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" />
            <XAxis dataKey="displayDate" axisLine={chartAxisLine} tick={chartAxisTick} tickLine={chartTickLine} minTickGap={28} />
            <YAxis axisLine={chartAxisLine} tick={chartAxisTick} tickLine={chartTickLine} tickFormatter={(value) => formatMoney({ amount: Number(value), currency })} />
            <Tooltip
              contentStyle={chartTooltipContentStyle}
              labelStyle={chartTooltipLabelStyle}
              labelFormatter={(label) => String(label)}
              formatter={(value, name) => [formatMoney({ amount: Number(value), currency }), name]}
            />
            <Line type="monotone" dataKey="portfolioGain" name={`${currency} ${gainLabel.toLowerCase()}`} stroke="var(--color-chart-series-1)" strokeWidth={2.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function MoneyMetric({ label, value, currency }: { label: string; value: number; currency: string }) {
  const tone = value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-foreground";
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>{formatMoney({ amount: value, currency })}</p>
    </div>
  );
}

function PercentMetric({ label, value }: { label: string; value: number | null }) {
  const tone = value == null ? "text-muted" : value > 0 ? "text-positive" : value < 0 ? "text-negative" : "text-foreground";
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${tone}`}>{value == null ? "—" : formatPercent(value)}</p>
    </div>
  );
}
