"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatMoney } from "../../lib/formatters";
import {
  chartSeparatorColor,
  chartSeriesColors,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

type DividendCoverageCurrencyRow = {
  currency: string;
  withYieldValue: number;
  withoutYieldValue: number;
};

type PortfolioDividendCoverageChartProps = {
  rows: DividendCoverageCurrencyRow[];
  isLoading: boolean;
  hasError: boolean;
};

export function PortfolioDividendCoverageChart({ rows, isLoading, hasError }: PortfolioDividendCoverageChartProps) {
  return (
    <section className="app-panel p-5">
      <h2 className="text-center text-base font-semibold text-foreground">Dividend Holdings by Market Value</h2>
      <p className="mt-1 text-center text-xs text-muted">Quarterly or more · current yield ≥1%</p>
      <div className="mt-4">
        {hasError ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border px-5 text-center text-sm text-muted">
            Current dividend yield data is unavailable.
          </div>
        ) : isLoading ? (
          <div className="flex h-64 items-center justify-center text-sm text-muted">Loading current yields…</div>
        ) : rows.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border px-5 text-center text-sm text-muted">
            No open securities in the selected accounts.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rows.map((row) => {
              const total = row.withYieldValue + row.withoutYieldValue;
              const data = [
                { label: "Div Holdings", value: row.withYieldValue },
                { label: "Non Div Holdings", value: row.withoutYieldValue },
              ].filter((item) => item.value > 0);
              return (
                <div key={row.currency} className="min-w-0 rounded-md border border-border bg-surface-muted p-3">
                  <h3 className="text-center text-sm font-semibold text-foreground">{row.currency}</h3>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={2} stroke={chartSeparatorColor} strokeWidth={2}>
                          {data.map((item) => <Cell key={item.label} fill={item.label === "Div Holdings" ? chartSeriesColors[1] : chartSeriesColors[0]} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={chartTooltipContentStyle}
                          labelStyle={chartTooltipLabelStyle}
                          formatter={(value, name) => [`${formatMoney({ amount: Number(value), currency: row.currency })} (${total > 0 ? (Number(value) / total * 100).toFixed(1) : "0.0"}%)`, name]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid gap-1.5">
                    {[
                      { label: "Div Holdings", value: row.withYieldValue, color: chartSeriesColors[1] },
                      { label: "Non Div Holdings", value: row.withoutYieldValue, color: chartSeriesColors[0] },
                    ].map((item) => (
                      <div key={item.label} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
                        <span className="truncate text-foreground" title={item.label}>{item.label}</span>
                        <span className="font-medium text-muted">{total > 0 ? (item.value / total * 100).toFixed(1) : "0.0"}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
