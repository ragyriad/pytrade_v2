"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { FilterBar } from "../components/dashboard/filterBar";
import { MoneySpinner } from "../components/loading/pageLoading";
import { Button } from "../components/ui/button";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  formatSource,
  signedValueClassName,
} from "../lib/formatters";
import type {
  HistoricSecurityDto,
  SecurityTransactionsResponseDto,
  TransactionDto,
} from "../lib/portfolioTypes";
import { accountMatchesFilters, defaultFilterBarState } from "../lib/accountFilters";
import { queryKeys } from "../state/queryKeys";
import { useSessionState } from "../state/sessionState";

type SecuritiesPageProps = {
  securities: HistoricSecurityDto[];
};

const EMPTY_TRANSACTIONS: TransactionDto[] = [];

async function fetchSecurityTransactions(
  securityId: string
): Promise<SecurityTransactionsResponseDto> {
  const response = await fetch(`/api/securities/${securityId}/transactions`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Unable to load transactions.");
  }

  return response.json();
}

export function SecuritiesPage({ securities }: SecuritiesPageProps) {
  const [filters, setFilters] = useSessionState(
    "securities:filters",
    defaultFilterBarState
  );
  const filterAccounts = useMemo(() => {
    const accountsById = new Map(
      securities.flatMap((security) => security.accounts ?? []).map((account) => [account.id, account])
    );
    return Array.from(accountsById.values());
  }, [securities]);
  const filteredSecurities = useMemo(() => {
    const hasAccountFilters =
      filters.brokerages.length > 0 ||
      filters.accountIds.length > 0 ||
      filters.accountTypes.length > 0 ||
      (filters.subTypes?.length ?? 0) > 0 ||
      (filters.registered?.length ?? 0) > 0;
    if (!hasAccountFilters) return securities;

    return securities.filter((security) =>
      (security.accounts ?? []).some((account) => accountMatchesFilters(account, filters))
    );
  }, [filters, securities]);
  const [expandedSecurityIds, setExpandedSecurityIds] = useState<Set<string>>(
    () => new Set()
  );

  function selectSecurity(security: HistoricSecurityDto) {
    setExpandedSecurityIds((current) => {
      const next = new Set(current);
      if (next.has(security.id)) next.delete(security.id);
      else next.add(security.id);
      return next;
    });
  }

  const securityColumns: TableColumn<HistoricSecurityDto>[] = [
    {
      key: "symbol",
      header: "Symbol",
      align: "left",
      value: (security) =>
        [security.symbol, security.rawSymbol, security.description]
          .filter(Boolean)
          .join(" "),
      render: (security) => {
        const selected = expandedSecurityIds.has(security.id);

        return (
        <Button
          type="button"
          variant="plain"
          onClick={() => selectSecurity(security)}
          className={
            selected
              ? "security-symbol-button-selected"
              : "security-symbol-button"
          }
        >
          {security.symbol}
        </Button>
        );
      },
    },
    {
      key: "description",
      header: "Security",
      align: "left",
      value: (security) =>
        [
          security.description,
          security.rawSymbol,
          security.symbol,
          security.exchangeCode,
          security.exchangeMicCode,
        ]
          .filter(Boolean)
          .join(" "),
      render: (security) => (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-foreground">
              {security.description ?? security.rawSymbol ?? security.symbol}
            </p>
            {security.listingStatus === "DELISTED" ? (
              <span className="rounded bg-inactive-surface px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-inactive-text">
                Delisted
              </span>
            ) : null}
          </div>
          <p className="text-xs text-content-tertiary">
            {security.exchangeCode ?? security.exchangeMicCode ?? "Exchange unknown"}
            {security.delistedAt
              ? ` · Delisted ${formatDate(security.delistedAt)}`
              : ""}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      value: (security) => security.instrumentType ?? "Unknown",
      render: (security) => security.instrumentType ?? "Unknown",
    },
    {
      key: "status",
      header: "Status",
      value: (security) => security.status,
      render: (security) => security.status,
    },
    {
      key: "transactions",
      header: "Total transactions",
      value: (security) => security.transactionCount,
      render: (security) => formatNumber(security.transactionCount),
    },
    {
      key: "dividends",
      header: "Dividends",
      value: (security) => security.dividendCount,
      render: (security) => formatNumber(security.dividendCount),
    },
    {
      key: "gainLoss",
      header: "Net Gain/Loss",
      value: (security) => security.totalGainLoss.amount,
      render: (security) =>
        security.status === "active" ? (
          <div className="inline-flex flex-col items-center gap-1">
            <span className="rounded bg-warning-surface px-2 py-1 text-xs font-semibold text-warning-text">
              Open position
            </span>
            <span className="text-xs text-content-tertiary">Not realized</span>
          </div>
        ) : (
          <span className={`font-medium ${signedValueClassName(security.totalGainLoss.amount)}`}>
            {formatMoney(security.totalGainLoss)}
            {security.totalGainLossPercent == null ? null : (
              <span className="ml-1 text-xs font-semibold text-muted">
                ({formatPercent(security.totalGainLossPercent)})
              </span>
            )}
          </span>
        ),
    },
    {
      key: "lastTrade",
      header: "Last Trade",
      value: (security) => security.lastTradeDate,
      render: (security) => formatDate(security.lastTradeDate),
    },
  ];

  return (
    <main className="app-main">
      <div className="app-page flex flex-col gap-6">
        <section className="app-panel p-4">
          <FilterBar
            accounts={filterAccounts}
            value={filters}
            onChange={setFilters}
            show={{ accountType: false, timeline: false }}
          />
        </section>
        <DataTable
          title="Historic Securities"
          stateKey="securities:history"
          rows={filteredSecurities}
          columns={securityColumns}
          getRowKey={(security) => security.id}
          emptyMessage={
            securities.length === 0
              ? "No security history found. Run the SnapTrade sync to populate securities."
              : "No securities match the selected account filters."
          }
          isRowExpanded={(security) => expandedSecurityIds.has(security.id)}
          renderExpandedRow={(security) => (
            <SecurityTransactionsSubTable
              key={security.id}
              isExpanded={expandedSecurityIds.has(security.id)}
              securityId={security.id}
            />
          )}
        />
      </div>
    </main>
  );
}

function SecurityTransactionsSubTable({
  isExpanded,
  securityId,
}: {
  isExpanded: boolean;
  securityId: string;
}) {
  const transactionsQuery = useQuery({
    queryKey: queryKeys.securityTransactions(securityId),
    queryFn: () => fetchSecurityTransactions(securityId),
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
  });
  const transactions = transactionsQuery.data?.transactions ?? EMPTY_TRANSACTIONS;
  const isLoading = transactionsQuery.isPending;
  const error = transactionsQuery.error instanceof Error
    ? transactionsQuery.error.message
    : transactionsQuery.error
      ? "Unable to load transactions."
      : null;
  const pageSize = 20;
  const [pageIndex, setPageIndex] = useSessionState(
    `securities:${securityId}:transactions-page`,
    0
  );

  const pageCount = Math.max(Math.ceil(transactions.length / pageSize), 1);
  const currentPageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = currentPageIndex * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, transactions.length);
  const pageTransactions = useMemo(
    () => transactions.slice(pageStart, pageEnd),
    [pageEnd, pageStart, transactions]
  );

  if (isLoading) {
    return (
      <div className="border-t border-interactive-border-subtle bg-interactive-surface p-8 text-center text-sm text-muted">
        <div className="mx-auto flex max-w-sm items-center justify-center gap-3 rounded-md border border-interactive-border bg-surface px-4 py-3 shadow-sm">
          <MoneySpinner />
          <span className="font-medium text-foreground">Loading transaction history</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-error-border-subtle bg-error-surface p-5 text-center text-sm text-error-text">
        {error}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="border-t border-border bg-surface-muted p-5 text-center text-sm text-muted">
        No transactions found for this security.
      </div>
    );
  }

  return (
    <div className="border-t border-interactive-border-subtle bg-interactive-surface p-4">
      <div className="overflow-x-auto rounded-md border border-border bg-surface shadow-sm">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-surface-muted text-xs uppercase text-muted">
            <tr>
              <th className="px-4 py-3 text-center font-medium">Date</th>
              <th className="px-4 py-3 text-center font-medium">Action</th>
              <th className="px-4 py-3 text-center font-medium">Source</th>
              <th className="px-4 py-3 text-left font-medium">Account</th>
              <th className="px-4 py-3 text-center font-medium">Units</th>
              <th className="px-4 py-3 text-center font-medium">Price</th>
              <th className="px-4 py-3 text-center font-medium">Amount</th>
              <th className="px-4 py-3 text-center font-medium">Fee</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pageTransactions.map((transaction, index) => (
              <tr
                key={transaction.id}
                className={index % 2 === 0 ? "bg-surface" : "bg-surface-muted"}
              >
                <td className="px-4 py-3 text-center">{formatDate(transaction.tradeDate)}</td>
                <td className="px-4 py-3 text-center">
                  {transaction.action ?? transaction.type}
                </td>
                <td className="px-4 py-3 text-center">
                  {formatSource(transaction.source)}
                </td>
                <td className="px-4 py-3 text-left">
                  <p className="font-medium text-foreground">
                    {transaction.accountName ?? transaction.accountId}
                  </p>
                  <p className="text-xs text-content-tertiary">
                    {[transaction.brokerageName, transaction.accountType]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </td>
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
                  className={`px-4 py-3 text-center ${signedValueClassName(
                    transaction.fee.amount
                  )}`}
                >
                  {formatMoney(transaction.fee)}
                </td>
                <td className="px-4 py-3 text-left">{transaction.description ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted">
            Showing {pageStart + 1}-{pageEnd} of {transactions.length} transactions
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setPageIndex((current) => Math.max(current - 1, 0))}
              disabled={currentPageIndex === 0}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </Button>
            <span className="min-w-20 text-center text-sm text-muted">
              Page {currentPageIndex + 1} of {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setPageIndex((current) => Math.min(current + 1, pageCount - 1))
              }
              disabled={currentPageIndex >= pageCount - 1}
              className="disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
