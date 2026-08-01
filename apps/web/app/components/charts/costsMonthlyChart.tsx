"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "../../lib/formatters";
import type { TransactionDto } from "../../lib/portfolioTypes";
import {
  buildMonthlyCostRows,
  type CostKind,
  type CostView,
  type MonthlyCostRow,
  type MonthlyCostSeries,
} from "../../services/costs";
import {
  chartGridColor,
  costFallbackColors,
  costFeeCurrencyColors,
  costTaxCurrencyColors,
} from "./chartColors";

function seriesColor(item: MonthlyCostSeries, index: number): string {
  const currency = item.currency.toUpperCase();
  const colors = item.kind === "fee" ? costFeeCurrencyColors : costTaxCurrencyColors;
  return colors[currency] ?? costFallbackColors[index % costFallbackColors.length];
}

type CostsMonthlyChartProps = {
  transactions: TransactionDto[];
  view: CostView;
};

type CostChartPanelProps = {
  kind: CostKind;
  rows: MonthlyCostRow[];
  series: MonthlyCostSeries[];
};

function CostChartPanel({ kind, rows, series }: CostChartPanelProps) {
  const seriesByLabel = new Map(series.map((item) => [item.label, item]));
  const visibleRows = rows.filter((row) =>
    series.some((item) => Math.abs(Number(row[item.key] ?? 0)) > 0.000001)
  );
  const title = kind === "fee" ? "Monthly fees" : "Monthly taxes";
  const description =
    kind === "fee"
      ? "Fee totals by month, grouped by currency"
      : "Tax totals by month, grouped by currency";

  return (
    <section className="app-panel p-5 text-center">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>

      <div className="mt-5 h-80">
        {visibleRows.length === 0 || series.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No {kind === "fee" ? "fee" : "tax"} history for this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={visibleRows}
              margin={{ left: 8, right: 24, top: 10, bottom: 0 }}
              barCategoryGap="20%"
            >
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={20} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => {
                  const item = seriesByLabel.get(String(name));
                  return formatMoney({
                    amount: Number(value),
                    currency: item?.currency ?? "USD",
                  });
                }}
              />
              <Legend />
              {series.map((item, index) => {
                return (
                  <Bar
                    key={item.key}
                    dataKey={item.key}
                    name={item.label}
                    fill={seriesColor(item, index)}
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    isAnimationActive
                    animationDuration={700}
                  />
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export function CostsMonthlyChart({ transactions, view }: CostsMonthlyChartProps) {
  const { series, rows } = buildMonthlyCostRows(transactions);
  const visibleKinds: CostKind[] =
    view === "fees" ? ["fee"] : view === "taxes" ? ["tax"] : ["fee", "tax"];

  return (
    <div className="grid gap-6">
      {visibleKinds.map((kind) => (
        <CostChartPanel
          key={kind}
          kind={kind}
          rows={rows}
          series={series.filter((item) => item.kind === kind)}
        />
      ))}
    </div>
  );
}
