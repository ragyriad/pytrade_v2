"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowTrendUp,
  faCircleNotch,
} from "@fortawesome/free-solid-svg-icons";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { Button } from "../ui/button";
import {
  formatDate,
  formatMoney,
  formatNumber,
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

  const selectedSecurity = useMemo(
    () => securities.find((security) => security.id === selectedSecurityId) ?? null,
    [securities, selectedSecurityId]
  );

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
      render: (security) => (
        <Button
          type="button"
          variant={security.id === selectedSecurityId ? "solid" : "ghost"}
          onClick={() => selectSecurity(security)}
          className="justify-start"
        >
          {security.symbol}
        </Button>
      ),
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
      header: "Transactions",
      render: (security) => formatNumber(security.transactionCount),
    },
    {
      key: "buys",
      header: "Buys",
      render: (security) => formatNumber(security.buyCount),
    },
    {
      key: "sells",
      header: "Sells",
      render: (security) => formatNumber(security.sellCount),
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
      render: (security) => (
        <span className={`font-medium ${signedValueClassName(security.totalGainLoss.amount)}`}>
          {formatMoney(security.totalGainLoss)}
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
    <main className="min-h-screen bg-zinc-50 p-6 text-zinc-950 sm:p-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="grid gap-4 md:grid-cols-3">
          <section className="rounded-md border border-zinc-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-zinc-500">Historic securities</p>
            <p className="mt-2 text-2xl font-semibold">{formatNumber(securities.length)}</p>
          </section>
          <section className="rounded-md border border-zinc-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-zinc-500">Active securities</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-700">
              {formatNumber(
                securities.filter((security) => security.status === "active").length
              )}
            </p>
          </section>
          <section className="rounded-md border border-zinc-200 bg-white p-5 text-center shadow-sm">
            <p className="text-sm text-zinc-500">Selected</p>
            <p className="mt-2 inline-flex items-center justify-center gap-2 text-2xl font-semibold">
              <FontAwesomeIcon icon={faArrowTrendUp} className="h-5 w-5 text-emerald-700" />
              {selectedSecurity?.symbol ?? "None"}
            </p>
          </section>
        </div>

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
  if (isLoading) {
    return (
      <div className="border-t border-emerald-100 bg-emerald-50/50 p-5 text-center text-sm text-zinc-600">
        <FontAwesomeIcon icon={faCircleNotch} className="mr-2 h-4 w-4 animate-spin" />
        Loading transaction history
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
            {transactions.map((transaction, index) => (
              <tr
                key={transaction.id}
                className={index % 2 === 0 ? "bg-white" : "bg-zinc-50"}
              >
                <td className="px-4 py-3 text-center">{formatDate(transaction.tradeDate)}</td>
                <td className="px-4 py-3 text-center">{transaction.type}</td>
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
      </div>
    </div>
  );
}
