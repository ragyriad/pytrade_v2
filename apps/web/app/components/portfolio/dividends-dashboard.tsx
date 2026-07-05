"use client";

import { useMemo, useState } from "react";
import {
  accountMatchesFilters,
  defaultFilterBarState,
  isActiveAccount,
} from "../../lib/account-filters";
import {
  formatDate,
  formatNumber,
  formatPercent,
  normalizeAccountType,
} from "../../lib/formatters";
import type {
  PortfolioDashboardDto,
  TransactionDto,
} from "../../lib/portfolio-types";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { FilterBar } from "../dashboard/filter-bar";
import { StatCard } from "../dashboard/stat-card";
import { DividendGrowthChart } from "./dividend-growth-chart";
import { filterTransactionsByTimeline } from "../../services/filter_timeline";
import {
  getActiveDividendPositionYields,
  getDividendYieldingPositionRows,
  type DividendYieldingPositionRow,
} from "../../services/dividends";
import {
  getDividendAccountShareGroups,
  getDividendIncomeMetrics,
} from "../../services/dividend_metrics";
import { DividendAccountShareChart } from "./dividend-account-share-chart";
import { DividendPositionYieldChart } from "./dividend-position-yield-chart";
import { MetricValueList } from "../dashboard/metric-value-list";

type DividendsDashboardProps = {
  dashboard: PortfolioDashboardDto;
};

export function DividendsDashboard({ dashboard }: DividendsDashboardProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const scopedTransactions = useMemo(() => {
    return dashboard.dividends.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.dividends.transactions, filters]);

  const scopedAllTransactions = useMemo(() => {
    return dashboard.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.transactions, filters]);

  const timelineTransactions = useMemo(
    () => filterTransactionsByTimeline(scopedTransactions, filters.timeline),
    [filters.timeline, scopedTransactions]
  );

  const filteredPositions = useMemo(() => {
    return dashboard.positions.filter((position) => {
      const account = accountsById.get(position.accountId);
      return accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.positions, filters]);

  const activeFilteredPositions = useMemo(() => {
    return dashboard.positions.filter((position) => {
      const account = accountsById.get(position.accountId);
      return isActiveAccount(account) && accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.positions, filters]);

  const positionYields = useMemo(() => {
    return getActiveDividendPositionYields(
      timelineTransactions,
      scopedAllTransactions,
      activeFilteredPositions,
      filters.timeline
    );
  }, [activeFilteredPositions, filters.timeline, scopedAllTransactions, timelineTransactions]);

  const dividendPositionRows = useMemo(() => {
    return getDividendYieldingPositionRows(
      timelineTransactions,
      scopedAllTransactions,
      filteredPositions,
      filters.timeline
    );
  }, [filteredPositions, filters.timeline, scopedAllTransactions, timelineTransactions]);

  const incomeMetrics = useMemo(
    () => getDividendIncomeMetrics(positionYields, timelineTransactions),
    [positionYields, timelineTransactions]
  );

  const accountShareGroups = useMemo(
    () => getDividendAccountShareGroups(timelineTransactions, dashboard.accounts),
    [dashboard.accounts, timelineTransactions]
  );

  const formatMoneyMetricRows = (values: typeof incomeMetrics.annualIncome) =>
    values.map((value) => ({
      id: value.currency,
      value: formatNumber(value.amount),
      suffix: value.currency,
    }));

  const formatPercentMetricRows = (
    values: typeof incomeMetrics.currentYieldByCurrency
  ) =>
    values
      .filter((value) => value.percent != null)
      .map((value) => ({
        id: value.currency,
        value: formatPercent(value.percent ?? 0),
        suffix: value.currency,
      }));

  const formatMoneyAmount = (value: { amount: number; currency: string }) => (
    <span className="inline-flex items-baseline justify-end gap-1">
      <span>{formatNumber(value.amount)}</span>
      <span className="text-xs font-medium uppercase tracking-normal text-zinc-500">
        {value.currency}
      </span>
    </span>
  );

  const formatNullablePercent = (value: number | null) =>
    value == null ? "-" : formatPercent(value);

  const positionColumns: TableColumn<DividendYieldingPositionRow>[] = [
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
        <span className="font-semibold text-emerald-700">
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
        <span className="font-semibold text-emerald-700">
          {formatNumber(transaction.amount.amount)}
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

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total dividends"
            value={<MetricValueList rows={formatMoneyMetricRows(incomeMetrics.totalDividends)} />}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Annual dividend income"
            value={<MetricValueList rows={formatMoneyMetricRows(incomeMetrics.annualIncome)} />}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Monthly dividend income"
            value={<MetricValueList rows={formatMoneyMetricRows(incomeMetrics.monthlyIncome)} />}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Current yield"
            value={
              <MetricValueList rows={formatPercentMetricRows(incomeMetrics.currentYieldByCurrency)} />
            }
            tone="positive"
            align="center"
          />
          <StatCard
            label="Yield on cost"
            value={
              <MetricValueList rows={formatPercentMetricRows(incomeMetrics.yieldOnCostByCurrency)} />
            }
            tone="positive"
            align="center"
          />
        </section>

        <section className="mt-6">
          <DividendAccountShareChart groups={accountShareGroups} />
        </section>

        <section className="mt-6">
          <DividendPositionYieldChart rows={positionYields} accounts={dashboard.accounts} />
        </section>

        <section className="mt-6">
          <DividendGrowthChart
            transactions={timelineTransactions}
            range={filters.timeline}
            onRangeChange={(timeline) => setFilters({ ...filters, timeline })}
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Dividend yielding positions"
            rows={dividendPositionRows}
            columns={positionColumns}
            getRowKey={(position) => position.id}
            emptyMessage="No dividend yielding positions match this view."
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Dividend transactions"
            rows={timelineTransactions}
            columns={transactionColumns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No dividend transactions match this view."
          />
        </section>
      </div>
    </main>
  );
}
