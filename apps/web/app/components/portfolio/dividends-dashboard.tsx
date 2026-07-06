"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  accountMatchesFilters,
  defaultFilterBarState,
} from "../../lib/account-filters";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  normalizeAccountType,
  signedValueClassName,
} from "../../lib/formatters";
import type {
  DividendDashboardSummaryDto,
  DividendYieldingPositionDto,
  MoneyBreakdownDto,
  PercentBreakdownDto,
  PortfolioDashboardDto,
  TransactionDto,
} from "../../lib/portfolio-types";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { FilterBar } from "../dashboard/filter-bar";
import { StatCard } from "../dashboard/stat-card";
import { DividendGrowthChart } from "./dividend-growth-chart";
import { DividendAccountShareChart } from "./dividend-account-share-chart";
import { DividendPositionYieldChart } from "./dividend-position-yield-chart";
import { MetricValueList } from "../dashboard/metric-value-list";

type DividendsDashboardProps = {
  dashboard: PortfolioDashboardDto;
  initialSummary: DividendDashboardSummaryDto;
  userId?: string;
};

export function DividendsDashboard({
  dashboard,
  initialSummary,
  userId,
}: DividendsDashboardProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);
  const [summary, setSummary] = useState(initialSummary);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const didHydrate = useRef(false);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const selectedAccountIds = useMemo(() => {
    return dashboard.accounts
      .filter((account) => accountMatchesFilters(account, filters))
      .map((account) => account.id)
      .sort();
  }, [dashboard.accounts, filters]);

  const selectedAccountIdKey = selectedAccountIds.join(",");

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();

    params.set("timeline", filters.timeline);
    params.set("accountIds", selectedAccountIdKey);
    if (userId) params.set("userId", userId);

    setIsSummaryLoading(true);
    setSummaryError(null);

    fetch(`/api/dividends/summary?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Unable to load dividend summary.");
        }

        return response.json() as Promise<DividendDashboardSummaryDto>;
      })
      .then(setSummary)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSummaryError(
          error instanceof Error ? error.message : "Unable to load dividend summary."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSummaryLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters.timeline, selectedAccountIdKey, userId]);

  const formatMoneyMetricRows = (values: MoneyBreakdownDto[]) =>
    values.map((value) => ({
      id: value.currency,
      value: formatNumber(Math.abs(value.amount)),
      suffix: value.currency,
      className: signedValueClassName(value.amount),
    }));

  const formatPercentMetricRows = (values: PercentBreakdownDto[]) =>
    values
      .filter((value) => value.percent != null)
      .map((value) => ({
        id: value.currency,
        value: formatPercent(value.percent ?? 0),
        suffix: value.currency,
      }));

  const formatMoneyAmount = (value: { amount: number; currency: string }) => (
    <span className="inline-flex items-baseline justify-end gap-1">
      {formatMoney(value)}
    </span>
  );

  const formatNullablePercent = (value: number | null) =>
    value == null ? "-" : formatPercent(value);

  const positionColumns: TableColumn<DividendYieldingPositionDto>[] = [
    {
      key: "symbol",
      header: "Symbol",
      align: "left",
      value: (position) => position.symbol,
      render: (position) => (
        <div>
          <p className="font-semibold text-zinc-950">{position.symbol}</p>
          <p className="line-clamp-1 text-xs text-zinc-500">
            {position.description ?? "Dividend yielding security"}
          </p>
        </div>
      ),
    },
    {
      key: "account",
      header: "Account",
      align: "left",
      value: (position) => accountsById.get(position.accountId)?.name ?? "Unknown",
      render: (position) => {
        const account = accountsById.get(position.accountId);

        return (
          <div>
            <p className="font-medium text-zinc-950">{account?.name ?? "Unknown"}</p>
            <p className="text-xs text-zinc-500">
              {[account?.institutionName, normalizeAccountType(account?.type ?? null)]
                .filter(Boolean)
                .join(" / ")}
            </p>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      value: (position) => position.status,
      render: (position) => (
        <span
          className={
            position.status === "open"
              ? "font-medium text-emerald-700"
              : "text-zinc-500"
          }
        >
          {position.status}
        </span>
      ),
    },
    {
      key: "totalDividends",
      header: "Total dividends",
      align: "right",
      value: (position) => position.totalDividends.amount,
      render: (position) => (
        <span className={`font-semibold ${signedValueClassName(position.totalDividends.amount)}`}>
          {formatMoneyAmount(position.totalDividends)}
        </span>
      ),
    },
    {
      key: "currentYield",
      header: "Current yield",
      align: "right",
      value: (position) => position.currentYieldPercent ?? null,
      render: (position) => formatNullablePercent(position.currentYieldPercent),
    },
    {
      key: "yieldOnCost",
      header: "Yield on cost",
      align: "right",
      value: (position) => position.yieldOnCostPercent ?? null,
      render: (position) => formatNullablePercent(position.yieldOnCostPercent),
    },
  ];

  const transactionColumns: TableColumn<TransactionDto>[] = [
    {
      key: "date",
      header: "Date",
      align: "center",
      render: (transaction) => formatDate(transaction.tradeDate),
    },
    {
      key: "account",
      header: "Account",
      align: "center",
      render: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
    },
    {
      key: "brokerage",
      header: "Brokerage",
      align: "center",
      render: (transaction) =>
        accountsById.get(transaction.accountId)?.institutionName ?? "Unknown",
    },
    {
      key: "symbol",
      header: "Symbol",
      align: "center",
      render: (transaction) => transaction.symbol ?? "-",
    },
    {
      key: "type",
      header: "Type",
      align: "center",
      render: (transaction) => transaction.assetType ?? "Dividend",
    },
    {
      key: "currency",
      header: "Currency",
      align: "center",
      render: (transaction) => transaction.amount.currency,
    },
    {
      key: "amount",
      header: "Amount",
      align: "center",
      render: (transaction) => (
        <span className={`font-semibold ${signedValueClassName(transaction.amount.amount)}`}>
          {formatMoney(transaction.amount)}
        </span>
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <FilterBar
            accounts={dashboard.accounts}
            value={filters}
            onChange={setFilters}
          />
        </section>

        {summaryError ? (
          <section className="mt-6 rounded-md border border-rose-200 bg-white p-4 text-sm text-rose-700 shadow-sm">
            {summaryError}
          </section>
        ) : null}

        {isSummaryLoading ? (
          <div className="mt-4 text-sm font-medium text-zinc-500">
            Updating dividend summary...
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total dividends"
            value={<MetricValueList rows={formatMoneyMetricRows(summary.metrics.totalDividends)} />}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Annual dividend income"
            value={<MetricValueList rows={formatMoneyMetricRows(summary.metrics.annualIncome)} />}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Monthly dividend income"
            value={<MetricValueList rows={formatMoneyMetricRows(summary.metrics.monthlyIncome)} />}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Current yield"
            value={
              <MetricValueList rows={formatPercentMetricRows(summary.metrics.currentYieldByCurrency)} />
            }
            tone="positive"
            align="center"
          />
          <StatCard
            label="Yield on cost"
            value={
              <MetricValueList rows={formatPercentMetricRows(summary.metrics.yieldOnCostByCurrency)} />
            }
            tone="positive"
            align="center"
          />
        </section>

        <section className="mt-6">
          <DividendAccountShareChart groups={summary.accountShareGroups} />
        </section>

        <section className="mt-6">
          <DividendPositionYieldChart rows={summary.positionYields} accounts={dashboard.accounts} />
        </section>

        <section className="mt-6">
          <DividendGrowthChart
            transactions={summary.transactions}
            range={filters.timeline}
            onRangeChange={(timeline) => setFilters({ ...filters, timeline })}
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Dividend yielding positions"
            rows={summary.positionRows}
            columns={positionColumns}
            getRowKey={(position) => position.id}
            emptyMessage="No dividend yielding positions match this view."
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Dividend transactions"
            rows={summary.transactions}
            columns={transactionColumns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No dividend transactions match this view."
          />
        </section>
      </div>
    </main>
  );
}
