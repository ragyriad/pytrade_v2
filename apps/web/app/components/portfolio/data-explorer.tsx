"use client";

import { useMemo, useState } from "react";
import {
  accountMatchesFilters,
  defaultFilterBarState,
  isActiveAccount,
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

export function DataExplorer({ dashboard }: DataExplorerProps) {
  const [activeTab, setActiveTab] = useState<DashboardTab>("positions");
  const [filters, setFilters] = useState(defaultFilterBarState);

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

  const filteredTransactions = useMemo(() => {
    const accountFiltered = dashboard.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return accountMatchesFilters(account, filters);
    });

    return filterTransactionsByTimeline(accountFiltered, filters.timeline);
  }, [accountsById, dashboard.transactions, filters]);

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
              onChange={setFilters}
            />
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
