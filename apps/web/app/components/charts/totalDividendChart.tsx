"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDate, formatMoney } from "../../lib/formatters";
import type { MoneyBreakdownDto, TransactionDto } from "../../lib/portfolioTypes";
import {
  chartAxisLine,
  chartAxisTick,
  chartCurrencyColor,
  chartGridColor,
  chartTickLine,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

type ChartRow = {
  date: string;
  displayDate: string;
  [currency: string]: string | number;
};

type TotalDividendsChartProps = {
  transactions: TransactionDto[];
  totals: MoneyBreakdownDto[];
};

function buildChartRows(transactions: TransactionDto[]): {
  currencies: string[];
  rows: ChartRow[];
} {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
  );
  const currencies = Array.from(
    new Set(sorted.map((transaction) => transaction.amount.currency))
  ).sort();
  const totals = new Map<string, number>();

  return {
    currencies,
    rows: sorted.map((transaction) => {
      const currency = transaction.amount.currency;
      totals.set(currency, (totals.get(currency) ?? 0) + Math.abs(transaction.amount.amount));

      const row: ChartRow = {
        date: transaction.tradeDate,
        displayDate: formatDate(transaction.tradeDate),
      };

      for (const code of currencies) {
        row[code] = totals.get(code) ?? 0;
      }

      return row;
    }),
  };
}

export function TotalDividendsChart({ transactions, totals }: TotalDividendsChartProps) {
  const { currencies, rows } = buildChartRows(transactions);

  return (
    <section className="app-panel p-5">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4 text-left">
        <div>
          <h2 className="mt-1 text-lg font-semibold text-action">
            Total Dividends
          </h2>
          {totals.length > 0 ? (
          <div className="flex flex-wrap gap-x-6 gap-y-2" aria-label="Total dividends by currency">
            {totals.map((total) => (
              <div key={total.currency} className="text-right">
                <p className="mt-0.5 text-base font-semibold text-foreground">
                  {formatMoney(total)}
                </p>
              </div>
            ))}
          </div>
        ) : null}
        </div>
      </div>

      <div className="mt-5 h-80">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No dividend history for this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ left: 8, right: 24, top: 18, bottom: 0 }}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" />
              <XAxis
                dataKey="displayDate"
                axisLine={chartAxisLine}
                tick={chartAxisTick}
                tickLine={chartTickLine}
                minTickGap={28}
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
                labelFormatter={(label) => String(label)}
              />
              {currencies.map((currency, index) => (
                <Area
                  key={currency}
                  type="monotone"
                  dataKey={currency}
                  stroke={chartCurrencyColor(currency, index)}
                  fill={chartCurrencyColor(currency, index)}
                  fillOpacity={0.16}
                  strokeWidth={2}
                  isAnimationActive
                  animationDuration={850}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
