"use client";

import { useMemo, useState } from "react";
import {
  accountMatchesFilters,
  defaultPortfolioFilters,
  isActiveAccount,
} from "../../lib/account-filters";
import { formatDate, formatMoney, formatMoneyBreakdown, formatPercent } from "../../lib/formatters";
import type {
  PortfolioDashboardDto,
  TransactionDto,
} from "../../lib/portfolio-types";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { PortfolioFilters } from "../dashboard/portfolio-filters";
import { StatCard } from "../dashboard/stat-card";
import { DividendGrowthChart } from "./dividend-growth-chart";
import { filterTransactionsByTimeline } from "../../business/timeline";
import {
  getAverageMonthlyDividends,
  getDividendTotals,
  getDividendYieldOnCostPercent,
} from "../../business/dividends";

type DividendsDashboardProps = {
  dashboard: PortfolioDashboardDto;
};

export function DividendsDashboard({ dashboard }: DividendsDashboardProps) {
  const [filters, setFilters] = useState(defaultPortfolioFilters);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const scopedTransactions = useMemo(() => {
    return dashboard.dividends.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.dividends.transactions, filters]);

  const timelineTransactions = useMemo(
    () => filterTransactionsByTimeline(scopedTransactions, filters.timeline),
    [filters.timeline, scopedTransactions]
  );

  const filteredPositions = useMemo(() => {
    return dashboard.positions.filter((position) => {
      const account = accountsById.get(position.accountId);
      return isActiveAccount(account) && accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.positions, filters]);

  const totalByCurrency = useMemo(
    () => getDividendTotals(timelineTransactions),
    [timelineTransactions]
  );

  const monthlyAverage = useMemo(() => {
    return getAverageMonthlyDividends(timelineTransactions, filters.timeline);
  }, [filters.timeline, timelineTransactions]);

  const yieldOnCost = useMemo(() => {
    return getDividendYieldOnCostPercent(
      timelineTransactions,
      filteredPositions,
      filters.timeline
    );
  }, [filteredPositions, filters.timeline, timelineTransactions]);

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
      key: "description",
      header: "Description",
      align: "center",
      render: (transaction) => (
        <span className="line-clamp-1 text-zinc-600">{transaction.description ?? "-"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "center",
      render: (transaction) => (
        <span className="font-semibold text-emerald-700">{formatMoney(transaction.amount)}</span>
      ),
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <PortfolioFilters
            accounts={dashboard.accounts}
            value={filters}
            onChange={setFilters}
          />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Total dividends"
            value={formatMoneyBreakdown(totalByCurrency, dashboard.summary.totalValue)}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Average monthly dividend income"
            value={formatMoneyBreakdown(monthlyAverage, dashboard.summary.totalValue)}
            tone="positive"
            align="center"
          />
          <StatCard
            label="Dividend yield on cost"
            value={yieldOnCost == null ? "-" : formatPercent(yieldOnCost)}
            tone="positive"
            align="center"
          />
        </section>

        <section className="mt-6">
          <DividendGrowthChart
            transactions={scopedTransactions}
            range={filters.timeline}
            onRangeChange={(timeline) => setFilters({ ...filters, timeline })}
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
