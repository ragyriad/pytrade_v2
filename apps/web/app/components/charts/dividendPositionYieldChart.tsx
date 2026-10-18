"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney, formatPercent, normalizeAccountType } from "../../lib/formatters";
import type { AccountDto, DividendPositionYieldDto } from "../../lib/portfolioTypes";
import { chartAccountColors, chartAxisColor, chartGridColor } from "./chartColors";

type DividendPositionYieldChartProps = {
  rows: DividendPositionYieldDto[];
  accounts: AccountDto[];
};

type ChartRow = DividendPositionYieldDto & {
  label: string;
  totalAmount: number;
  topAccountKey: string | null;
  [accountKey: `account_${string}`]: number;
};

type YieldLabelProps = {
  x?: number | string;
  y?: number | string;
  width?: number | string;
  value?: number | string | null;
  payload?: ChartRow;
};

function formatAxisMoney(value: number, currency: string): string {
  return `${new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(value)} ${currency}`;
}

function accountKey(accountId: string): `account_${string}` {
  return `account_${accountId}`;
}

export function DividendPositionYieldChart({
  rows,
  accounts,
}: DividendPositionYieldChartProps) {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const visibleAccountIds = Array.from(
    new Set(
      rows.flatMap((row) => row.accountSegments.map((segment) => segment.accountId))
    )
  ).sort((a, b) => {
    const accountA = accountsById.get(a);
    const accountB = accountsById.get(b);
  const labelA = `${normalizeAccountType(accountA?.subType ?? accountA?.type ?? null)} ${accountA?.institutionName ?? ""}`;
  const labelB = `${normalizeAccountType(accountB?.subType ?? accountB?.type ?? null)} ${accountB?.institutionName ?? ""}`;
    return labelA.localeCompare(labelB);
  });
  const accountLabels = new Map(
    visibleAccountIds.map((accountId) => {
      const account = accountsById.get(accountId);
  const accountType = normalizeAccountType(account?.subType ?? account?.type ?? null);
      const brokerage = account?.institutionName ?? "Unknown";
      return [accountId, `${accountType} ${brokerage}`];
    })
  );
  const colorByAccount = new Map(
    visibleAccountIds.map((accountId, index) => [
      accountId,
      chartAccountColors[index % chartAccountColors.length],
    ])
  );
  const chartRows: ChartRow[] = rows.map((row) => ({
    ...row,
    label: row.symbol,
    totalAmount: row.dividendAmount.amount,
    topAccountKey:
      row.accountSegments.length > 0
        ? accountKey(row.accountSegments[row.accountSegments.length - 1].accountId)
        : null,
    ...Object.fromEntries(
      row.accountSegments.map((segment) => [
        accountKey(segment.accountId),
        segment.dividendAmount.amount,
      ])
    ),
  }));
  const currency = chartRows[0]?.dividendAmount.currency ?? "USD";

  return (
    <section className="app-panel p-6 text-center">
      <div className="border-b border-border pb-4 text-left">
        <h2 className="text-base font-semibold text-action">
          Total Dividends Per Asset
        </h2>
      </div>

      {visibleAccountIds.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-left text-xs text-muted">
          {visibleAccountIds.map((accountId) => (
            <div key={accountId} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: colorByAccount.get(accountId) }}
              />
              <span>{accountLabels.get(accountId)}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-6 h-[28rem]">
        {chartRows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No active dividend positions match this view.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartRows}
              margin={{ left: 34, right: 28, top: 34, bottom: 30 }}
              barCategoryGap="22%"
            >
              <CartesianGrid stroke={chartGridColor} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                type="category"
                axisLine={{ stroke: chartGridColor }}
                tick={{ fill: chartAxisColor, fontSize: 12, fontWeight: 600 }}
                tickLine={false}
                tickMargin={14}
                interval={0}
                minTickGap={8}
                padding={{ left: 24, right: 24 }}
              />
              <YAxis
                type="number"
                width={112}
                axisLine={false}
                tick={{ fill: chartAxisColor, fontSize: 12 }}
                tickLine={false}
                tickFormatter={(value) => formatAxisMoney(Number(value), currency)}
              />
              <Tooltip
                labelFormatter={(_, payload) => {
                  const row = payload?.[0]?.payload as ChartRow | undefined;
                  return row?.description ? `${row.symbol} - ${row.description}` : row?.symbol;
                }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as ChartRow;
                  const activeSegments = row.accountSegments.filter(
                    (segment) => segment.dividendAmount.amount > 0
                  );

                  return (
                    <div className="min-w-72 rounded-md border border-border bg-surface p-4 text-left text-sm shadow-lg">
                      <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
                        <div>
                          <p className="text-base font-semibold text-foreground">{row.symbol}</p>
                          {row.description ? (
                            <p className="mt-1 max-w-64 text-xs leading-5 text-muted">
                              {row.description}
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded bg-interactive-surface px-2 py-1 text-xs font-semibold text-action">
                          {formatPercent(row.yieldOnCostPercent)}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-muted">
                        {activeSegments.map((segment) => (
                          <div key={segment.accountId} className="flex justify-between gap-4">
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-sm"
                                style={{
                                  backgroundColor: colorByAccount.get(segment.accountId),
                                }}
                              />
                              {accountLabels.get(segment.accountId)}
                            </span>
                            <span className="font-semibold text-foreground">
                              {formatMoney(segment.dividendAmount)}
                            </span>
                          </div>
                        ))}
                        <div className="my-1 border-t border-border" />
                        <div className="flex justify-between gap-4">
                          <span>Total dividends</span>
                          <span className="font-semibold text-foreground">
                            {formatMoney(row.dividendAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Annualized dividends</span>
                          <span className="font-semibold text-foreground">
                            {formatMoney(row.annualizedDividendAmount)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Dividend per share</span>
                          <span className="font-semibold text-foreground">
                            {formatMoney(row.dividendPerShare)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Cost per unit</span>
                          <span className="font-semibold text-foreground">
                            {formatMoney(row.costPerUnit)}
                          </span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span>Position amount</span>
                          <span className="font-semibold text-foreground">
                            {formatMoney(row.costBasis)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }}
              />
              {visibleAccountIds.map((accountId) => {
                const key = accountKey(accountId);

                return (
                  <Bar
                    key={accountId}
                    dataKey={key}
                    stackId="dividends"
                    fill={colorByAccount.get(accountId)}
                    radius={[4, 4, 0, 0]}
                  >
                    <LabelList
                      position="top"
                      content={(props) => {
                        const { x, y, width, value, payload } = props as YieldLabelProps;
                        const row = payload;
                        if (!row || row.topAccountKey !== key || Number(value ?? 0) <= 0) {
                          return null;
                        }

                        return (
                          <text
                            x={Number(x) + Number(width) / 2}
                            y={Number(y) - 8}
                            textAnchor="middle"
                            className="fill-action-hover text-xs font-bold"
                          >
                            {formatPercent(row.yieldOnCostPercent)}
                          </text>
                        );
                      }}
                    />
                  </Bar>
                );
              })}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
