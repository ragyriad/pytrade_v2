"use client";

import { useMemo, useState } from "react";
import { accountMatchesFilters, defaultFilterBarState } from "../lib/accountFilters";
import {
  formatDate,
  formatMoney,
  formatMoneyBreakdown,
  formatNumber,
  signedValueClassName,
} from "../lib/formatters";
import type {
  AccountDto,
  DashboardTab,
  MoneyDto,
  PortfolioDashboardDto,
  TransactionDto,
} from "../lib/portfolioTypes";
import {
  type OptionSecurityRow,
  buildOptionSecurityRows,
  getActiveOptionCount,
  getOptionFees,
  getOptionPnl,
  isOptionTransaction,
} from "../services/options";
import { filterTransactionsByTimeline } from "../services/filter_timeline";
import { Button } from "../components/ui/button";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { FilterBar } from "../components/dashboard/filterBar";
import { SegmentedTabs } from "../components/dashboard/segmentedTabs";
import { StatCard } from "../components/dashboard/statCard";

type OptionsPageProps = {
  dashboard: PortfolioDashboardDto;
};

function fallbackMoney(currency = "USD"): MoneyDto {
  return { amount: 0, currency };
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

export function OptionsPage({ dashboard }: OptionsPageProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);
  const [activeTab, setActiveTab] = useState<DashboardTab>("transactions");
  const [selectedSecurityId, setSelectedSecurityId] = useState<string | null>(null);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const scopedOptionTransactions = useMemo(() => {
    return dashboard.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return (
        isOptionTransaction(transaction) &&
        !transaction.isArchived &&
        accountMatchesFilters(account, filters)
      );
    });
  }, [accountsById, dashboard.transactions, filters]);

  const filteredOptionTransactions = useMemo(
    () =>
      filterTransactionsByTimeline(
        scopedOptionTransactions,
        filters.timeline
      ),
    [filters.timeline, scopedOptionTransactions]
  );

  const optionSecurityRows = useMemo(
    () =>
      buildOptionSecurityRows(
        filteredOptionTransactions,
        scopedOptionTransactions
      ),
    [filteredOptionTransactions, scopedOptionTransactions]
  );
  const activeOptionCount = useMemo(
    () => getActiveOptionCount(scopedOptionTransactions),
    [scopedOptionTransactions]
  );
  const totalFees = useMemo(
    () => getOptionFees(filteredOptionTransactions),
    [filteredOptionTransactions]
  );
  const totalPnl = useMemo(
    () => getOptionPnl(filteredOptionTransactions),
    [filteredOptionTransactions]
  );

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
      render: (transaction) => transaction.action ?? transaction.type,
    },
    {
      key: "optionAction",
      header: "Option action",
      value: (transaction) => transaction.optionAction ?? "-",
      render: (transaction) => transaction.optionAction ?? "-",
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
      render: (transaction) => (
        <span className="font-semibold text-primary-700">{transaction.symbol ?? "-"}</span>
      ),
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      value: (transaction) => transaction.units ?? null,
      render: (transaction) =>
        transaction.units == null ? (
          "-"
        ) : (
          formatNumber(transaction.units)
        ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      value: (transaction) => transaction.price?.amount ?? null,
      render: (transaction) =>
        transaction.price ? (
          <span className={signedValueClassName(transaction.price.amount)}>
            {formatMoney(transaction.price)}
          </span>
        ) : (
          "-"
        ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      value: (transaction) => transaction.amount.amount,
      render: (transaction) => (
        <span className={`font-medium ${signedValueClassName(transaction.amount.amount)}`}>
          {formatMoney(transaction.amount)}
        </span>
      ),
    },
    {
      key: "fee",
      header: "Fee",
      align: "right",
      value: (transaction) => transaction.fee.amount,
      render: (transaction) => (
        <span className={`font-medium ${signedValueClassName(transaction.fee.amount)}`}>
          {formatMoney(transaction.fee)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      value: (transaction) => transaction.description ?? "-",
      render: (transaction) => (
        <span className="line-clamp-1 text-content-secondary">{transaction.description ?? "-"}</span>
      ),
    },
  ];

  const securityColumns: TableColumn<OptionSecurityRow>[] = [
    {
      key: "symbol",
      header: "Symbol",
      align: "left",
      value: (security) => security.symbol,
      render: (security) => {
        const selected = security.id === selectedSecurityId;

        return (
          <Button
            type="button"
            variant={selected ? "outline" : "ghost"}
            onClick={() => setSelectedSecurityId(selected ? null : security.id)}
            className={
              selected
                ? "justify-start border-primary-500 bg-primary-50 text-primary-800 shadow-sm hover:bg-primary-100"
                : "justify-start text-primary-700 hover:text-primary-800"
            }
          >
            {security.symbol}
          </Button>
        );
      },
    },
    {
      key: "transactions",
      header: "Option transactions",
      align: "right",
      value: (security) => security.transactionCount,
      render: (security) => formatInteger(security.transactionCount),
    },
    {
      key: "activeOptions",
      header: "Active options",
      align: "right",
      value: (security) => security.activeOptionCount,
      render: (security) => formatInteger(security.activeOptionCount),
    },
    {
      key: "fees",
      header: "Fees",
      align: "right",
      value: (security) => security.totalFees.reduce((sum, fee) => sum + fee.amount, 0),
      render: (security) => {
        const value = security.totalFees.reduce((sum, fee) => sum + fee.amount, 0);
        return (
          <span className={`font-medium ${signedValueClassName(value)}`}>
            {formatMoneyBreakdown(security.totalFees, fallbackMoney())}
          </span>
        );
      },
    },
    {
      key: "pnl",
      header: "P&L",
      align: "right",
      value: (security) => security.totalPnl.reduce((sum, pnl) => sum + pnl.amount, 0),
      render: (security) => {
        const value = security.totalPnl.reduce((sum, pnl) => sum + pnl.amount, 0);
        return (
          <span className={`font-medium whitespace-pre-line ${signedValueClassName(value)}`}>
            {formatMoneyBreakdown(security.totalPnl, fallbackMoney())}
          </span>
        );
      },
    },
    {
      key: "lastTrade",
      header: "Last trade",
      value: (security) => security.lastTradeDate ?? "",
      render: (security) => formatDate(security.lastTradeDate),
    },
  ];

  return (
    <main className="app-main">
      <div className="app-page">
        <section className="app-panel p-4">
          <FilterBar accounts={dashboard.accounts} value={filters} onChange={setFilters} />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Active options"
            value={formatInteger(activeOptionCount)}
            align="center"
          />
          <StatCard
            label="Total option fees"
            value={formatMoneyBreakdown(totalFees, fallbackMoney(dashboard.summary.totalValue.currency))}
            tone="negative"
            align="center"
          />
          <StatCard
            label="Options P&L"
            value={formatMoneyBreakdown(totalPnl, fallbackMoney(dashboard.summary.totalValue.currency))}
            tone={
              totalPnl.reduce((sum, value) => sum + value.amount, 0) >= 0
                ? "positive"
                : "negative"
            }
            align="center"
          />
        </section>

        <section className="app-panel mt-6 p-4">
          <SegmentedTabs
            value={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setSelectedSecurityId(null);
            }}
            options={[
              {
                id: "transactions",
                label: "Transactions",
                count: filteredOptionTransactions.length,
              },
              {
                id: "securities",
                label: "Securities",
                count: optionSecurityRows.length,
              },
            ]}
          />
        </section>

        <section className="mt-4">
          {activeTab === "transactions" ? (
            <DataTable
              title="Option transactions"
              rows={filteredOptionTransactions}
              columns={transactionColumns}
              getRowKey={(transaction) => transaction.id}
              emptyMessage="No option transactions match this view."
            />
          ) : (
            <DataTable
              title="Securities with option activity"
              rows={optionSecurityRows}
              columns={securityColumns}
              getRowKey={(security) => security.id}
              emptyMessage="No securities have option transactions in this view."
              isRowExpanded={(security) => security.id === selectedSecurityId}
              renderExpandedRow={(security) => (
                <OptionTransactionsSubTable
                  accountsById={accountsById}
                  transactions={security.transactions}
                />
              )}
            />
          )}
        </section>
      </div>
    </main>
  );
}

function OptionTransactionsSubTable({
  accountsById,
  transactions,
}: {
  accountsById: Map<string, AccountDto>;
  transactions: TransactionDto[];
}) {
  return (
    <div className="border-t border-primary-100 bg-primary-50 p-4">
      <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 text-center font-medium">Date</th>
              <th className="px-4 py-3 text-center font-medium">Action</th>
              <th className="px-4 py-3 text-center font-medium">Option action</th>
              <th className="px-4 py-3 text-left font-medium">Account</th>
              <th className="px-4 py-3 text-left font-medium">Source</th>
              <th className="px-4 py-3 text-center font-medium">Units</th>
              <th className="px-4 py-3 text-center font-medium">Price</th>
              <th className="px-4 py-3 text-center font-medium">Amount</th>
              <th className="px-4 py-3 text-center font-medium">Fee</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {transactions.map((transaction, index) => (
              <tr
                key={transaction.id}
                className={index % 2 === 0 ? "bg-surface" : "bg-surface-muted"}
              >
                <td className="px-4 py-3 text-center">{formatDate(transaction.tradeDate)}</td>
                <td className="px-4 py-3 text-center">
                  {transaction.action ?? transaction.type}
                </td>
                <td className="px-4 py-3 text-center">{transaction.optionAction ?? "-"}</td>
                <td className="px-4 py-3 text-left">
                  {accountsById.get(transaction.accountId)?.name ?? "Unknown"}
                </td>
                <td className="px-4 py-3 text-left">{transaction.source}</td>
                <td className="px-4 py-3 text-center">
                  {transaction.units == null ? (
                    "-"
                  ) : (
                    formatNumber(transaction.units)
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {transaction.price ? (
                    <span className={signedValueClassName(transaction.price.amount)}>
                      {formatMoney(transaction.price)}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td
                  className={`px-4 py-3 text-center font-medium ${signedValueClassName(
                    transaction.amount.amount
                  )}`}
                >
                  {formatMoney(transaction.amount)}
                </td>
                <td
                  className={`px-4 py-3 text-center font-medium ${signedValueClassName(
                    transaction.fee.amount
                  )}`}
                >
                  {formatMoney(transaction.fee)}
                </td>
                <td className="px-4 py-3 text-left text-muted">
                  {transaction.description ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
