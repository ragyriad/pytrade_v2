"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatMoney } from "../../lib/formatters";
import type { TransactionDto } from "../../lib/portfolioTypes";
import {
  chartAxisLine,
  chartAxisTick,
  chartCurrencyColor,
  chartGridColor,
  chartTickLine,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

type DividendMonthlyGrowthChartProps = {
  transactions: TransactionDto[];
};

type ChartRow = {
  monthKey: string;
  label: string;
  [currency: string]: string | number;
};

function buildMonthlyRows(transactions: TransactionDto[]): {
  currencies: string[];
  rows: ChartRow[];
} {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
  );
  const currencies = Array.from(
    new Set(sorted.map((transaction) => transaction.amount.currency))
  ).sort();
  const rowsByMonth = new Map<string, ChartRow>();

  for (const transaction of sorted) {
    const date = new Date(transaction.tradeDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const currency = transaction.amount.currency;
    const existing =
      rowsByMonth.get(monthKey) ??
      ({
        monthKey,
        label: formatDate(`${monthKey}-01`),
      } as ChartRow);

    existing[currency] =
      Number(existing[currency] ?? 0) + Math.abs(transaction.amount.amount);
    rowsByMonth.set(monthKey, existing);
  }

  const rows = Array.from(rowsByMonth.values()).sort((a, b) =>
    a.monthKey.localeCompare(b.monthKey)
  );

  for (const row of rows) {
    for (const currency of currencies) {
      row[currency] = Number(row[currency] ?? 0);
    }
  }

  return { currencies, rows };
}

export function DividendMonthlyGrowthChart({
  transactions,
}: DividendMonthlyGrowthChartProps) {
  const { currencies, rows } = buildMonthlyRows(transactions);

  return (
    <section className="app-panel p-5">
      <div className="border-b border-border pb-4 text-left">
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Monthly Dividends
        </h2>
      </div>

      <div className="mt-5 h-80">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No monthly dividend history for this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 8, right: 24, top: 18, bottom: 0 }}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={chartAxisLine}
                tick={chartAxisTick}
                tickLine={chartTickLine}
                minTickGap={20}
              />
              <YAxis
                axisLine={chartAxisLine}
                tick={chartAxisTick}
                tickLine={chartTickLine}
              />
              <Tooltip
                contentStyle={chartTooltipContentStyle}
                labelStyle={chartTooltipLabelStyle}
                formatter={(value, name) =>
                  formatMoney({ amount: Number(value), currency: String(name) })
                }
              />
              {currencies.map((currency, index) => (
                <Bar
                  key={currency}
                  dataKey={currency}
                  fill={chartCurrencyColor(currency, index)}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive
                  animationDuration={850}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
