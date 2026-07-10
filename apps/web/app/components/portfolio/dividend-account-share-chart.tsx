"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatMoney, formatPercent } from "../../lib/formatters";
import type { DividendAccountShareGroupDto } from "../../lib/portfolio-types";

type DividendAccountShareChartProps = {
  groups: DividendAccountShareGroupDto[];
};

const colors = [
  "#2f6f9f",
  "#047857",
  "#7c3aed",
  "#be123c",
  "#b45309",
  "#0891b2",
  "#4f46e5",
  "#be185d",
  "#16a34a",
  "#ea580c",
  "#0f766e",
  "#4338ca",
];

export function DividendAccountShareChart({ groups }: DividendAccountShareChartProps) {
  return (
    <section className="app-panel p-5">
      <div className="text-left">
        <h2 className="text-base font-semibold text-foreground">
          Dividend share by account
        </h2>
        <p className="mt-1 text-sm text-muted">
          Total received dividends by account
        </p>
      </div>

      <div className="mt-5">
        {groups.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No dividend transactions match this view.
          </div>
        ) : (
          <div className="grid gap-8">
            {groups.map((group) => (
              <div
                key={group.currency}
                className="grid gap-6 lg:grid-cols-[340px_1fr] lg:items-center"
              >
                <div className="min-w-0">
                  {groups.length > 1 ? (
                    <p className="text-center text-sm font-semibold text-foreground">
                      {group.currency}
                    </p>
                  ) : null}
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={group.rows}
                          dataKey="value"
                          nameKey="label"
                          cx="50%"
                          cy="50%"
                          innerRadius={64}
                          outerRadius={112}
                          paddingAngle={1}
                          stroke="#ffffff"
                          strokeWidth={2}
                        >
                          {group.rows.map((row, index) => (
                            <Cell key={row.id} fill={colors[index % colors.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, item) => {
                            const payload = item.payload as DividendAccountShareGroupDto["rows"][number];

                            return [
                              `${formatMoney({
                                amount: Number(value),
                                currency: payload.currency,
                              })} (${formatPercent(payload.percentage)})`,
                              payload.label,
                            ];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="scrollbar-thick max-h-72 overflow-y-auto pr-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.rows.map((row, index) => (
                      <div
                        key={row.id}
                        className="grid grid-cols-[12px_1fr_auto] items-center gap-3 rounded-md border border-border bg-surface-muted px-3 py-2"
                      >
                        <span
                          className="h-3 w-3 rounded-sm"
                          style={{ backgroundColor: colors[index % colors.length] }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {row.label}
                          </p>
                          <p className="text-xs text-muted">
                            {formatMoney({ amount: row.value, currency: row.currency })}
                          </p>
                        </div>
                        <span className="text-sm text-muted">
                          {formatPercent(row.percentage)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
