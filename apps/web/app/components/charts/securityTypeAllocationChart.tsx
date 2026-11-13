"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieSlice } from "./allocationPieChart";
import { formatMoney } from "../../lib/formatters";
import {
  chartSeparatorColor,
  chartSeriesColors,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

export function SecurityTypeAllocationChart({ rows }: { rows: PieSlice[] }) {
  const currencies = Array.from(new Set(rows.map((row) => row.currency)));

  return (
    <section className="app-panel p-5">
      <h2 className="text-center text-base font-semibold text-foreground">Portfolio by Security Type</h2>
      <p className="mt-1 text-center text-xs text-muted">Market value allocation, calculated separately by currency</p>
      {currencies.length === 0 ? (
        <div className="mt-5 flex h-64 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">No positions to chart.</div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {currencies.map((currency) => {
            const currencyRows = rows.filter((row) => row.currency === currency);
            const total = currencyRows.reduce((sum, row) => sum + row.value, 0);
            const sizedRows = currencyRows.map((row) => ({ ...row, percentage: total > 0 ? row.value / total * 100 : 0 }));
            return (
              <div key={currency} className="min-w-0 rounded-md border border-border bg-surface-muted p-3">
                <h3 className="text-center text-sm font-semibold text-foreground">{currency}</h3>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sizedRows} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={48} outerRadius={82} paddingAngle={1} stroke={chartSeparatorColor} strokeWidth={2}>
                        {sizedRows.map((row, index) => <Cell key={row.label} fill={chartSeriesColors[index % chartSeriesColors.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={chartTooltipContentStyle} labelStyle={chartTooltipLabelStyle} formatter={(value, _name, item) => {
                        const payload = item.payload as PieSlice;
                        return [`${formatMoney({ amount: Number(value), currency })} (${payload.percentage.toFixed(1)}%)`, payload.label];
                      }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid gap-1.5">
                  {sizedRows.map((row, index) => (
                    <div key={row.label} className="grid grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chartSeriesColors[index % chartSeriesColors.length] }} aria-hidden="true" />
                      <span className="truncate text-foreground" title={row.label}>{row.label}</span>
                      <span className="font-medium text-muted">{row.percentage.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
