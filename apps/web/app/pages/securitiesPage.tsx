"use client";

import { useMemo, useState } from "react";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
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

type SecuritiesPageProps = {
  securities: HistoricSecurityDto[];
  userId?: string;
};

async function fetchSecurityTransactions(
  securityId: string,
  userId?: string
): Promise<SecurityTransactionsResponseDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(`/api/securities/${securityId}/transactions${params}`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Unable to load transactions.");
  }

  return response.json();
}

export function SecuritiesPage({ securities, userId }: SecuritiesPageProps) {
  const [expandedSecurityIds, setExpandedSecurityIds] = useState<Set<string>>(
    () => new Set()
  );
  const [transactionResponses, setTransactionResponses] = useState<
    Record<string, SecurityTransactionsResponseDto>
  >({});
  const [loadingSecurityIds, setLoadingSecurityIds] = useState<Set<string>>(
    () => new Set()
  );
  const [errorsBySecurityId, setErrorsBySecurityId] = useState<Record<string, string>>({});

  async function selectSecurity(security: HistoricSecurityDto) {
    const nextExpanded = new Set(expandedSecurityIds);

    if (nextExpanded.has(security.id)) {
      nextExpanded.delete(security.id);
      setExpandedSecurityIds(nextExpanded);
      return;
    }

    nextExpanded.add(security.id);
    setExpandedSecurityIds(nextExpanded);
    setErrorsBySecurityId((current) => {
      const next = { ...current };
      delete next[security.id];
      return next;
    });

    if (transactionResponses[security.id]) return;

    setLoadingSecurityIds((current) => new Set(current).add(security.id));

    try {
      const response = await fetchSecurityTransactions(security.id, userId);
      setTransactionResponses((current) => ({
        ...current,
        [security.id]: response,
      }));
    } catch (caught) {
      setErrorsBySecurityId((current) => ({
        ...current,
        [security.id]:
          caught instanceof Error ? caught.message : "Unable to load transactions.",
      }));
    } finally {
      setLoadingSecurityIds((current) => {
        const next = new Set(current);
        next.delete(security.id);
        return next;
      });
    }
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
        <DataTable
          title="Historic Securities"
          rows={securities}
          columns={securityColumns}
          getRowKey={(security) => security.id}
          emptyMessage="No security history found. Run the SnapTrade sync to populate securities."
          isRowExpanded={(security) => expandedSecurityIds.has(security.id)}
          renderExpandedRow={(security) => (
            <SecurityTransactionsSubTable
              key={
                transactionResponses[security.id]?.transactions
                  .map((transaction) => transaction.id)
                  .join("|") ?? security.id
              }
              error={errorsBySecurityId[security.id] ?? null}
              isLoading={loadingSecurityIds.has(security.id)}
              transactions={transactionResponses[security.id]?.transactions ?? []}
            />
          )}
        />
      </div>
    </main>
  );
}

function SecurityTransactionsSubTable({
  transactions,
  isLoading,
  error,
}: {
  transactions: TransactionDto[];
  isLoading: boolean;
  error: string | null;
}) {
  const pageSize = 20;
  const [pageIndex, setPageIndex] = useState(0);

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
