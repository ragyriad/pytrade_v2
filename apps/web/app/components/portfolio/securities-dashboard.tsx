"use client";

import { useEffect, useMemo, useState } from "react";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { MoneySpinner } from "../loading/page-loading";
import { Button } from "../ui/button";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  signedValueClassName,
} from "../../lib/formatters";
import type {
  HistoricSecurityDto,
  SecurityTransactionsResponseDto,
  TransactionDto,
} from "../../lib/portfolio-types";

type SecuritiesDashboardProps = {
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

export function SecuritiesDashboard({ securities, userId }: SecuritiesDashboardProps) {
  const [selectedSecurityId, setSelectedSecurityId] = useState<string | null>(null);
  const [transactionResponses, setTransactionResponses] = useState<
    Record<string, SecurityTransactionsResponseDto>
  >({});
  const [loadingSecurityId, setLoadingSecurityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function selectSecurity(security: HistoricSecurityDto) {
    if (selectedSecurityId === security.id) {
      setSelectedSecurityId(null);
      setError(null);
      return;
    }

    setSelectedSecurityId(security.id);
    setError(null);

    if (transactionResponses[security.id]) return;

    setLoadingSecurityId(security.id);

    try {
      const response = await fetchSecurityTransactions(security.id, userId);
      setTransactionResponses((current) => ({
        ...current,
        [security.id]: response,
      }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load transactions.");
    } finally {
      setLoadingSecurityId(null);
    }
  }

  const securityColumns: TableColumn<HistoricSecurityDto>[] = [
    {
      key: "symbol",
      header: "Symbol",
      align: "left",
      render: (security) => {
        const selected = security.id === selectedSecurityId;

        return (
        <Button
          type="button"
          variant={selected ? "outline" : "ghost"}
          onClick={() => selectSecurity(security)}
          className={
            selected
              ? "justify-start border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm shadow-emerald-100 hover:bg-emerald-100"
              : "justify-start"
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
      render: (security) => (
        <div>
          <p className="font-medium text-zinc-950">
            {security.description ?? security.rawSymbol ?? security.symbol}
          </p>
          <p className="text-xs text-zinc-500">
            {security.exchangeCode ?? security.exchangeMicCode ?? "Exchange unknown"}
          </p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (security) => security.instrumentType ?? "Unknown",
    },
    {
      key: "status",
      header: "Status",
      render: (security) => (
        <span
          className={
            security.status === "active" ? "font-medium text-emerald-700" : "text-zinc-500"
          }
        >
          {security.status}
        </span>
      ),
    },
    {
      key: "transactions",
      header: "Total transactions",
      render: (security) => formatNumber(security.transactionCount),
    },
    {
      key: "dividends",
      header: "Dividends",
      render: (security) => (
        <span className="font-medium text-emerald-700">
          {formatNumber(security.dividendCount)}
        </span>
      ),
    },
    {
      key: "gainLoss",
      header: "Net Gain/Loss",
      render: (security) =>
        security.status === "active" ? (
          <div className="inline-flex flex-col items-center gap-1">
            <span className="rounded bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
              Open position
            </span>
            <span className="text-xs text-zinc-500">Not realized</span>
          </div>
        ) : (
          <span className={`font-medium ${signedValueClassName(security.totalGainLoss.amount)}`}>
            {formatMoney(security.totalGainLoss)}
            {security.totalGainLossPercent == null ? null : (
              <span className="ml-1 text-xs font-semibold text-zinc-500">
                ({formatPercent(security.totalGainLossPercent)})
              </span>
            )}
          </span>
        ),
    },
    {
      key: "lastTrade",
      header: "Last Trade",
      render: (security) => formatDate(security.lastTradeDate),
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-6 text-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <DataTable
          title="Historic Securities"
          rows={securities}
          columns={securityColumns}
          getRowKey={(security) => security.id}
          emptyMessage="No security history found. Run the SnapTrade sync to populate securities."
          isRowExpanded={(security) => security.id === selectedSecurityId}
          renderExpandedRow={(security) => (
            <SecurityTransactionsSubTable
              error={security.id === selectedSecurityId ? error : null}
              isLoading={loadingSecurityId === security.id}
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
  const pageSize = 10;
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [transactions]);

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
      <div className="border-t border-emerald-100 bg-emerald-50/60 p-8 text-center text-sm text-zinc-600">
        <div className="mx-auto flex max-w-sm items-center justify-center gap-3 rounded-md border border-emerald-200 bg-white px-4 py-3 shadow-sm">
          <MoneySpinner />
          <span className="font-medium text-zinc-700">Loading transaction history</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-rose-100 bg-rose-50 p-5 text-center text-sm text-rose-700">
        {error}
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="border-t border-zinc-200 bg-zinc-50 p-5 text-center text-sm text-zinc-500">
        No transactions found for this security.
      </div>
    );
  }

  return (
    <div className="border-t border-emerald-100 bg-emerald-50/40 p-4">
      <div className="overflow-x-auto rounded-md border border-zinc-200 bg-white shadow-sm">
        <table className="w-full min-w-[940px] text-sm">
          <thead className="bg-zinc-100 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3 text-center font-medium">Date</th>
              <th className="px-4 py-3 text-center font-medium">Action</th>
              <th className="px-4 py-3 text-center font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Account</th>
              <th className="px-4 py-3 text-center font-medium">Units</th>
              <th className="px-4 py-3 text-center font-medium">Price</th>
              <th className="px-4 py-3 text-center font-medium">Amount</th>
              <th className="px-4 py-3 text-center font-medium">Fee</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {pageTransactions.map((transaction, index) => (
              <tr
                key={transaction.id}
                className={index % 2 === 0 ? "bg-white" : "bg-zinc-50"}
              >
                <td className="px-4 py-3 text-center">{formatDate(transaction.tradeDate)}</td>
                <td className="px-4 py-3 text-center">
                  {transaction.action ?? transaction.type}
                </td>
                <td className="px-4 py-3 text-center">{transaction.assetType ?? "Other"}</td>
                <td className="px-4 py-3 text-left">
                  <p className="font-medium text-zinc-950">
                    {transaction.accountName ?? transaction.accountId}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {[transaction.brokerageName, transaction.accountType]
                      .filter(Boolean)
                      .join(" / ")}
                  </p>
                </td>
                <td className="px-4 py-3 text-center">
                  {transaction.units == null ? "-" : formatNumber(transaction.units)}
                </td>
                <td className="px-4 py-3 text-center">
                  {transaction.price ? formatMoney(transaction.price) : "-"}
                </td>
                <td
                  className={`px-4 py-3 text-center font-medium ${signedValueClassName(
                    transaction.amount.amount
                  )}`}
                >
                  {formatMoney(transaction.amount)}
                </td>
                <td
                  className={`px-4 py-3 text-center ${
                    transaction.fee.amount > 0 ? "text-rose-700" : "text-zinc-950"
                  }`}
                >
                  {formatMoney(transaction.fee)}
                </td>
                <td className="px-4 py-3 text-left">{transaction.description ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-col gap-3 border-t border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-zinc-500">
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
            <span className="min-w-20 text-center text-sm text-zinc-500">
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
