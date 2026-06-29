"use client";

import { useMemo, useState } from "react";
import { accountMatchesFilters, defaultFilterBarState } from "../../lib/account-filters";
import { formatDate, formatMoney, formatMoneyBreakdown, signedValueClassName } from "../../lib/formatters";
import type { PortfolioDashboardDto, TransactionDto } from "../../lib/portfolio-types";
import { filterTransactionsByTimeline } from "../../services/filter_timeline";
import { getFeeTotals } from "../../services/fees";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { FilterBar } from "../dashboard/filter-bar";
import { StatCard } from "../dashboard/stat-card";
import { FeesMonthlyChart } from "./fees-monthly-chart";

type FeesDashboardProps = {
  dashboard: PortfolioDashboardDto;
};

export function FeesDashboard({ dashboard }: FeesDashboardProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const feeTransactions = useMemo(() => {
    return dashboard.fees.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.fees.transactions, filters]);

  const timelineFeeTransactions = useMemo(
    () => filterTransactionsByTimeline(feeTransactions, filters.timeline),
    [feeTransactions, filters.timeline]
  );

  const totalFees = useMemo(() => getFeeTotals(timelineFeeTransactions), [timelineFeeTransactions]);

  const columns: TableColumn<TransactionDto>[] = [
    {
      key: "date",
      header: "Date",
      render: (transaction) => formatDate(transaction.tradeDate),
    },
    {
      key: "account",
      header: "Account",
      render: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
    },
    {
      key: "brokerage",
      header: "Brokerage",
      render: (transaction) =>
        accountsById.get(transaction.accountId)?.institutionName ?? "Unknown",
    },
    {
      key: "action",
      header: "Action",
      render: (transaction) => transaction.action ?? transaction.type,
    },
    {
      key: "type",
      header: "Type",
      render: (transaction) => transaction.assetType ?? "Other",
    },
    {
      key: "symbol",
      header: "Symbol",
      render: (transaction) => transaction.symbol ?? "-",
    },
    {
      key: "amount",
      header: "Amount",
      render: (transaction) => (
        <span className={signedValueClassName(transaction.amount.amount)}>
          {formatMoney(transaction.amount)}
        </span>
      ),
    },
    {
      key: "fee",
      header: "Fee",
      render: (transaction) => (
        <span className="font-semibold text-rose-700">
          {formatMoney({ ...transaction.fee, amount: Math.abs(transaction.fee.amount) })}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (transaction) => (
        <span className="line-clamp-1 text-zinc-600">{transaction.description ?? "-"}</span>
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

        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <StatCard
            label="Fee-incurring transactions"
            value={String(timelineFeeTransactions.length)}
            align="center"
          />
          <StatCard
            label="Total fees"
            value={formatMoneyBreakdown(totalFees, dashboard.summary.totalValue)}
            tone="negative"
            align="center"
          />
        </section>

        <section className="mt-6">
          <FeesMonthlyChart transactions={feeTransactions} />
        </section>

        <section className="mt-6">
          <DataTable
            title="Transactions with fees"
            rows={timelineFeeTransactions}
            columns={columns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No fee-incurring transactions match the selected filters."
          />
        </section>
      </div>
    </main>
  );
}
