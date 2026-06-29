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
import { Button } from "../ui/button";
import { formatDate, formatMoney } from "../../lib/formatters";
import type { TransactionDto } from "../../lib/portfolio-types";
import { timelineOptions, type TimelineRange } from "../../services/filter_timeline";

const colors = ["#047857", "#2563eb", "#7c3aed", "#ca8a04"];

type ChartRow = {
  date: string;
  displayDate: string;
  [currency: string]: string | number;
};

type DividendGrowthChartProps = {
  transactions: TransactionDto[];
  range: TimelineRange;
  onRangeChange: (range: TimelineRange) => void;
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

export function DividendGrowthChart({
  transactions,
  range,
  onRangeChange,
}: DividendGrowthChartProps) {
  const { currencies, rows } = buildChartRows(transactions);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5 text-center shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">Cumulative dividends</h2>
          <p className="mt-1 text-sm text-zinc-500">Dividend income over time</p>
        </div>
        <div className="flex justify-center gap-2">
          {timelineOptions.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={range === option.value ? "solid" : "outline"}
              onClick={() => onRangeChange(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-5 h-80">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-zinc-200 text-sm text-zinc-500">
            No dividend history for this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={rows} margin={{ left: 8, right: 24, top: 10, bottom: 0 }}>
              <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
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
                  stroke={colors[index % colors.length]}
                  fill={colors[index % colors.length]}
                  fillOpacity={0.16}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
