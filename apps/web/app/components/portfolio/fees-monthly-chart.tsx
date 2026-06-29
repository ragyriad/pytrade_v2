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
import { buildMonthlyFeeRows } from "../../services/fees";
import { formatMoney } from "../../lib/formatters";
import type { TransactionDto } from "../../lib/portfolio-types";

const colors = ["#dc2626", "#ca8a04", "#7c3aed", "#2563eb"];

type FeesMonthlyChartProps = {
  transactions: TransactionDto[];
};

export function FeesMonthlyChart({ transactions }: FeesMonthlyChartProps) {
  const { currencies, rows } = buildMonthlyFeeRows(transactions);

  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5 text-center shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">Monthly fees</h2>
      <p className="mt-1 text-sm text-zinc-500">Fee totals by month across the available history</p>

      <div className="mt-5 h-80">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-zinc-200 text-sm text-zinc-500">
            No fee history for this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 8, right: 24, top: 10, bottom: 0 }}>
              <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} minTickGap={20} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) =>
                  formatMoney({ amount: Number(value), currency: String(name) })
                }
              />
              {currencies.map((currency, index) => (
                <Bar
                  key={currency}
                  dataKey={currency}
                  fill={colors[index % colors.length]}
                  radius={[3, 3, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
