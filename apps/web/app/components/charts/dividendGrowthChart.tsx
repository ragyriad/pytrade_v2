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
import type { TransactionDto } from "../../lib/portfolio-types";
import { dividendCurrencyColor } from "./dividendChartColors";

type ChartRow = {
  date: string;
  displayDate: string;
  [currency: string]: string | number;
};

type DividendGrowthChartProps = {
  transactions: TransactionDto[];
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

export function DividendGrowthChart({ transactions }: DividendGrowthChartProps) {
  const { currencies, rows } = buildChartRows(transactions);

  return (
    <section className="app-panel p-5">
      <div className="border-b border-border pb-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-normal text-primary-700">
          Dividend growth
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Cumulative dividends
        </h2>
        <p className="mt-1 text-sm text-muted">
          Running dividend income based on the selected timeline
        </p>
      </div>

      <div className="mt-5 h-80">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No dividend history for this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ left: 8, right: 24, top: 18, bottom: 0 }}>
              <CartesianGrid stroke="#d8e1ea" strokeDasharray="3 3" />
              <XAxis dataKey="displayDate" tick={{ fontSize: 12 }} minTickGap={28} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
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
                  stroke={dividendCurrencyColor(currency, index)}
                  fill={dividendCurrencyColor(currency, index)}
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
