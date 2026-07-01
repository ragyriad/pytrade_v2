"use client";

import { useMemo, useState } from "react";
import {
  accountMatchesFilters,
  defaultFilterBarState,
  isActiveAccount,
  type PortfolioFilterState,
} from "../../lib/account-filters";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  normalizeAccountType,
  signedValueClassName,
} from "../../lib/formatters";
import { getUnrealizedReturnPercent } from "../../services/portfolio";
import { filterTransactionsByTimeline } from "../../services/filter_timeline";
import type {
  AccountDto,
  DashboardTab,
  PortfolioDashboardDto,
  PositionDto,
  TransactionDto,
} from "../../lib/portfolio-types";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { FilterBar } from "../dashboard/filter-bar";
import { SegmentedTabs } from "../dashboard/segmented-tabs";

type DataExplorerProps = {
  dashboard: PortfolioDashboardDto;
};

function toDateInputValue(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function getDateRangeForTimeline(
  transactions: TransactionDto[],
  timeline: PortfolioFilterState["timeline"]
): { from: string; to: string } {
  if (transactions.length === 0 || timeline === "NONE") {
    return { from: "", to: "" };
  }

  const dates = transactions.map((transaction) => new Date(transaction.tradeDate).getTime());
  const latest = new Date(Math.max(...dates));
  const earliest = new Date(Math.min(...dates));
  const start = new Date(latest);

  if (timeline === "ALL") {
    return { from: toDateInputValue(earliest), to: toDateInputValue(latest) };
  }

  if (timeline === "1M") start.setMonth(start.getMonth() - 1);
  if (timeline === "3M") start.setMonth(start.getMonth() - 3);
  if (timeline === "6M") start.setMonth(start.getMonth() - 6);
  if (timeline === "1Y") start.setFullYear(start.getFullYear() - 1);
  if (timeline === "2Y") start.setFullYear(start.getFullYear() - 2);
  if (timeline === "5Y") start.setFullYear(start.getFullYear() - 5);

  return { from: toDateInputValue(start), to: toDateInputValue(latest) };
}

function filterTransactionsByDateRange(
  transactions: TransactionDto[],
  dateRange: { from: string; to: string }
): TransactionDto[] {
  if (!dateRange.from && !dateRange.to) return transactions;

  const from = dateRange.from ? new Date(`${dateRange.from}T00:00:00`) : null;
  const to = dateRange.to ? new Date(`${dateRange.to}T23:59:59.999`) : null;

  return transactions.filter((transaction) => {
    const tradeDate = new Date(transaction.tradeDate);
    if (from && tradeDate < from) return false;
    if (to && tradeDate > to) return false;
    return true;
  });
}

export function DataExplorer({ dashboard }: DataExplorerProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("positions");
  const [filters, setFilters] = useState(defaultFilterBarState);
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const filteredAccounts = useMemo(() => {
    return dashboard.accounts.filter((account) => accountMatchesFilters(account, filters));
  }, [dashboard.accounts, filters]);

  const filteredPositions = useMemo(() => {
    return dashboard.positions.filter((position) => {
      const account = accountsById.get(position.accountId);
      return isActiveAccount(account) && accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.positions, filters]);

  const scopedTransactions = useMemo(() => {
    return dashboard.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return (
        accountMatchesFilters(account, filters) &&
        (filters.showArchived || !transaction.isArchived)
      );
    });
  }, [accountsById, dashboard.transactions, filters]);

  const filteredTransactions = useMemo(() => {
    if (dateRange.from || dateRange.to) {
      return filterTransactionsByDateRange(scopedTransactions, dateRange);
    }

    return filterTransactionsByTimeline(scopedTransactions, filters.timeline);
  }, [dateRange, filters.timeline, scopedTransactions]);

  const handleFiltersChange = (nextFilters: PortfolioFilterState) => {
    if (nextFilters.timeline !== filters.timeline) {
      setDateRange(getDateRangeForTimeline(scopedTransactions, nextFilters.timeline));
    }

    setFilters(nextFilters);
  };

  const handleDateRangeChange = (field: "from" | "to", value: string) => {
    setDateRange((current) => ({ ...current, [field]: value }));
    setFilters((current) => ({ ...current, timeline: "NONE" }));
  };

  const accountColumns: TableColumn<AccountDto>[] = [
    {
      key: "name",
      header: "Account",
      value: (account) => account.name,
      render: (account) => <span className="font-medium text-zinc-950">{account.name}</span>,
    },
    {
      key: "brokerage",
      header: "Brokerage",
      value: (account) => account.institutionName ?? "Unknown",
      render: (account) => account.institutionName ?? "Unknown",
    },
    {
      key: "type",
      header: "Type",
      value: (account) => normalizeAccountType(account.type),
      render: (account) => normalizeAccountType(account.type),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      value: (account) => account.balance.amount,
      render: (account) => (
        <span className={`font-medium ${signedValueClassName(account.balance.amount)}`}>
          {formatMoney(account.balance)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      value: (account) => account.status ?? "unknown",
      render: (account) => account.status ?? "unknown",
    },
    {
      key: "synced",
      header: "Last sync",
      value: (account) => account.lastSyncedAt ?? "",
      render: (account) => formatDate(account.lastSyncedAt),
    },
  ];

  const positionColumns: TableColumn<PositionDto>[] = [
    {
      key: "symbol",
      header: "Symbol",
      value: (position) => position.symbol,
      render: (position) => <span className="font-semibold text-zinc-950">{position.symbol}</span>,
    },
    {
      key: "account",
      header: "Account",
      value: (position) => accountsById.get(position.accountId)?.name ?? "Unknown",
      render: (position) => accountsById.get(position.accountId)?.name ?? "Unknown",
    },
    {
      key: "brokerage",
      header: "Brokerage",
      value: (position) => accountsById.get(position.accountId)?.institutionName ?? "Unknown",
      render: (position) => accountsById.get(position.accountId)?.institutionName ?? "Unknown",
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      value: (position) => position.units,
      render: (position) => formatNumber(position.units),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      value: (position) => position.price?.amount ?? null,
      render: (position) => (position.price ? formatMoney(position.price) : "-"),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      value: (position) => position.marketValue.amount,
      render: (position) => (
        <span className={`font-medium ${signedValueClassName(position.marketValue.amount)}`}>
          {formatMoney(position.marketValue)}
        </span>
      ),
    },
    {
      key: "pnl",
      header: "Unrealized",
      align: "right",
      value: (position) => position.unrealizedGainLoss?.amount ?? null,
      render: (position) =>
        position.unrealizedGainLoss ? (
          <span className={signedValueClassName(position.unrealizedGainLoss.amount)}>
            {formatMoney(position.unrealizedGainLoss)}
          </span>
        ) : (
          "-"
        ),
    },
    {
      key: "pnlPercent",
      header: "Unrealized %",
      align: "right",
      value: (position) => getUnrealizedReturnPercent(position),
      render: (position) => {
        const percent = getUnrealizedReturnPercent(position);
        return percent == null ? (
          "-"
        ) : (
          <span className={signedValueClassName(percent)}>{formatPercent(percent)}</span>
        );
      },
    },
  ];

  const transactionColumns: TableColumn<TransactionDto>[] = [
    {
      key: "date",
      header: "Date",
      value: (transaction) => transaction.tradeDate,
      render: (transaction) => formatDate(transaction.tradeDate),
    },
    {
      key: "action",
      header: "Action",
      value: (transaction) => transaction.action ?? transaction.type,
      render: (transaction) => (
        <span className="font-medium">{transaction.action ?? transaction.type}</span>
      ),
    },
    {
      key: "assetType",
      header: "Type",
      value: (transaction) => transaction.assetType ?? "Other",
      render: (transaction) => transaction.assetType ?? "Other",
    },
    {
      key: "source",
      header: "Source",
      value: (transaction) => transaction.source,
      render: (transaction) => transaction.source,
    },
    {
      key: "account",
      header: "Account",
      value: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
      render: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
    },
    {
      key: "symbol",
      header: "Symbol",
      value: (transaction) => transaction.symbol ?? "-",
      render: (transaction) => transaction.symbol ?? "-",
    },
    {
      key: "description",
      header: "Description",
      value: (transaction) => transaction.description ?? "-",
      render: (transaction) => (
        <span className="line-clamp-1 text-zinc-600">{transaction.description ?? "-"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      value: (transaction) => transaction.amount.amount,
      render: (transaction) => {
        const signed = (transaction.action ?? transaction.type).includes("DIVIDEND")
          ? Math.abs(transaction.amount.amount)
          : transaction.amount.amount;
        return (
          <span className={`font-medium ${signedValueClassName(signed)}`}>
            {formatMoney(transaction.amount)}
          </span>
        );
      },
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4">
            <FilterBar
              accounts={dashboard.accounts}
              value={filters}
              onChange={handleFiltersChange}
            />
            {activeTab === "transactions" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex w-fit flex-col gap-1 text-xs font-medium uppercase text-zinc-500">
                  <span>From</span>
                  <input
                    type="date"
                    value={dateRange.from}
                    onChange={(event) => handleDateRangeChange("from", event.target.value)}
                    className="h-10 min-w-40 rounded-md border border-zinc-200 bg-white px-3 text-sm normal-case text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </label>
                <label className="flex w-fit flex-col gap-1 text-xs font-medium uppercase text-zinc-500">
                  <span>To</span>
                  <input
                    type="date"
                    value={dateRange.to}
                    onChange={(event) => handleDateRangeChange("to", event.target.value)}
                    className="h-10 min-w-40 rounded-md border border-zinc-200 bg-white px-3 text-sm normal-case text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
                  />
                </label>
              </div>
            ) : null}
            <SegmentedTabs
              value={activeTab}
              onChange={setActiveTab}
              options={[
                { id: "positions", label: "Positions", count: filteredPositions.length },
                { id: "transactions", label: "Transactions", count: filteredTransactions.length },
                { id: "accounts", label: "Accounts", count: filteredAccounts.length },
              ]}
            />
          </div>
        </section>

        <div className="mt-4">
          {activeTab === "accounts" && (
            <DataTable
              title="Brokerage accounts"
              rows={filteredAccounts}
              columns={accountColumns}
              getRowKey={(account) => account.id}
              emptyMessage="No accounts match the selected filters."
            />
          )}
          {activeTab === "positions" && (
            <DataTable
              title="Positions"
              rows={filteredPositions}
              columns={positionColumns}
              getRowKey={(position) => position.id}
              emptyMessage="No positions match the selected filters."
            />
          )}
          {activeTab === "transactions" && (
            <DataTable
              title="Transactions"
              titleAccessory={
                <label className="inline-flex h-8 cursor-pointer items-center gap-2 text-sm font-medium text-zinc-700">
                  <input
                    type="checkbox"
                    checked={filters.showArchived}
                    onChange={(event) =>
                      setFilters({ ...filters, showArchived: event.target.checked })
                    }
                    className="h-4 w-4 rounded border-zinc-300 text-emerald-700 focus:ring-emerald-600"
                  />
                  <span className="whitespace-nowrap">Show archived</span>
                </label>
              }
              rows={filteredTransactions}
              columns={transactionColumns}
              getRowKey={(transaction) => transaction.id}
              emptyMessage="No transactions match the selected filters."
            />
          )}
        </div>
      </div>
    </main>
  );
}
