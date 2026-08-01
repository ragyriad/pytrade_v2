"use client";

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { formatMoney, formatPercent } from "../../lib/formatters";
import type { DividendAccountShareGroupDto } from "../../lib/portfolioTypes";
import {
  chartAccountShareColors,
  chartSeparatorColor,
  chartTooltipContentStyle,
  chartTooltipLabelStyle,
} from "./chartColors";

type DividendAccountShareChartProps = {
  groups: DividendAccountShareGroupDto[];
};

export function DividendAccountShareChart({ groups }: DividendAccountShareChartProps) {
  return (
    <section className="app-panel p-4">
      <div className="border-b border-border pb-3 text-left">
        <h2 className="text-base font-semibold text-action">
          Dividend share by account
        </h2>
      </div>

      <div className="mt-4">
        {groups.length === 0 ? (
          <div className="flex h-72 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No dividend transactions match this view.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {groups.map((group) => (
              <div
                key={group.currency}
                className="h-56 min-w-0"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={group.rows}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={92}
                      paddingAngle={1}
                      stroke={chartSeparatorColor}
                      strokeWidth={2}
                    >
                      {group.rows.map((row, index) => (
                        <Cell
                          key={row.id}
                          fill={chartAccountShareColors[index % chartAccountShareColors.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={chartTooltipContentStyle}
                      labelStyle={chartTooltipLabelStyle}
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
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
