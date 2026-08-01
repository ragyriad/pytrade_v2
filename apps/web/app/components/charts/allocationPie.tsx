"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatMoney } from "../../lib/formatters";

export type PieSlice = {
  label: string;
  value: number;
  percentage: number;
  currency: string;
};

const colors = [
  "#2f6f9f",
  "#047857",
  "#b45309",
  "#7c3aed",
  "#be123c",
  "#0891b2",
  "#4f46e5",
  "#be185d",
  "#16a34a",
  "#ea580c",
  "#0f766e",
  "#4338ca",
];

type AllocationPieProps = {
  title: string;
  rows: PieSlice[];
};

export function AllocationPie({ title, rows }: AllocationPieProps) {
  return (
    <section className="app-panel p-5 text-center">
      <div className="flex items-center justify-center gap-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[360px_1fr] lg:items-center">
        <div className="h-80 min-w-0">
          {rows.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
              No positions to chart.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="value"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  innerRadius={72}
                  outerRadius={126}
                  paddingAngle={1}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {rows.map((row, index) => (
                    <Cell key={row.label} fill={colors[index % colors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, _name, item) => {
                    const payload = item.payload as PieSlice;
                    return [
                      `${formatMoney({
                        amount: Number(value),
                        currency: payload.currency,
                      })} (${payload.percentage.toFixed(1)}%)`,
                      payload.label,
                    ];
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="scrollbar-thick max-h-80 overflow-y-auto pr-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {rows.map((row, index) => (
              <div
                key={row.label}
                className="grid grid-cols-[12px_1fr_auto] items-center gap-3 rounded-md border border-border bg-surface-muted px-3 py-2"
              >
                <span
                  className="h-3 w-3 rounded-sm"
                  style={{ backgroundColor: colors[index % colors.length] }}
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{row.label}</p>
                  <p className="text-xs text-muted">
                    {formatMoney({ amount: row.value, currency: row.currency })}
                  </p>
                </div>
                <span className="text-sm text-muted">{row.percentage.toFixed(1)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
