"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  accountMatchesFilters,
  defaultFilterBarState,
} from "../lib/accountFilters";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  normalizeAccountType,
  signedValueClassName,
} from "../lib/formatters";
import type {
  DividendDashboardSummaryDto,
  DividendYieldingPositionDto,
  MoneyBreakdownDto,
  PercentBreakdownDto,
  PortfolioDashboardDto,
  TransactionDto,
} from "../lib/portfolioTypes";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { FilterBar } from "../components/dashboard/filterBar";
import { SegmentedTabs } from "../components/dashboard/segmentedTabs";
import { StatCard } from "../components/dashboard/statCard";
import { DividendCurrentYearChart } from "../components/charts/dividendCurrentYearChart";
import { DividendGrowthChart } from "../components/charts/dividendGrowthChart";
import { DividendMonthlyGrowthChart } from "../components/charts/dividendMonthlyGrowthChart";
import { DividendTotalBarChart } from "../components/charts/dividendTotalBarChart";
import { DividendAccountShareChart } from "../components/charts/dividendAccountShareChart";
import { DividendPositionYieldChart } from "../components/charts/dividendPositionYieldChart";
import { DividendEventsCalendar } from "../components/portfolio/dividendEventsCalendar";
import { MetricValueList } from "../components/dashboard/metricValueList";

type DividendsPageProps = {
  dashboard: PortfolioDashboardDto;
  initialSummary: DividendDashboardSummaryDto;
};

type DividendTableTab = "positions" | "transactions" | "calendar";

export function DividendsPage({
  dashboard,
  initialSummary,
}: DividendsPageProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);
  const [activeTableTab, setActiveTableTab] =
    useState<DividendTableTab>("positions");
  const [summary, setSummary] = useState(initialSummary);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const didHydrate = useRef(false);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const selectedAccountIds = useMemo(() => {
    return dashboard.accounts
      .filter((account) => accountMatchesFilters(account, filters))
      .map((account) => account.id)
      .sort();
  }, [dashboard.accounts, filters]);

  const selectedAccountIdKey = selectedAccountIds.join(",");
  const selectedAccountIdSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds]
  );
  const currentYearDividendTransactions = useMemo(() => {
    return dashboard.dividends.transactions.filter((transaction) =>
      selectedAccountIdSet.has(transaction.accountId)
    );
  }, [dashboard.dividends.transactions, selectedAccountIdSet]);

  useEffect(() => {
    if (!didHydrate.current) {
      didHydrate.current = true;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams();

    params.set("timeline", filters.timeline);
    params.set("accountIds", selectedAccountIdKey);

    setIsSummaryLoading(true);
    setSummaryError(null);

    fetch(`/api/dividends/summary?${params.toString()}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Unable to load dividend summary.");
        }

        return response.json() as Promise<DividendDashboardSummaryDto>;
      })
      .then(setSummary)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSummaryError(
          error instanceof Error ? error.message : "Unable to load dividend summary."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSummaryLoading(false);
        }
      });

    return () => controller.abort();
  }, [filters.timeline, selectedAccountIdKey]);

  const formatMoneyMetricRows = (values: MoneyBreakdownDto[]) =>
    values.map((value) => ({
      id: value.currency,
      value: formatNumber(Math.abs(value.amount)),
      suffix: value.currency,
    }));

  const formatPercentMetricRows = (values: PercentBreakdownDto[]) =>
    values
      .filter((value) => value.percent != null)
      .map((value) => ({
        id: value.currency,
        value: formatPercent(value.percent ?? 0),
        suffix: value.currency,
      }));

  const formatMoneyAmount = (value: { amount: number; currency: string }) => (
    <span
      className={`inline-flex items-baseline justify-end gap-1 ${signedValueClassName(
        value.amount
      )}`}
    >
      {formatMoney(value)}
    </span>
  );

  const formatNullablePercent = (value: number | null) =>
    value == null ? "-" : formatPercent(value);

  const positionColumns: TableColumn<DividendYieldingPositionDto>[] = [
    {
      key: "symbol",
      header: "Symbol",
      align: "left",
      value: (position) => position.symbol,
      render: (position) => (
        <div>
          <p className="font-semibold text-foreground">{position.symbol}</p>
          <p className="line-clamp-1 text-xs text-content-tertiary">
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
            <p className="font-medium text-foreground">{account?.name ?? "Unknown"}</p>
            <p className="text-xs text-content-tertiary">
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
              ? "font-medium text-action"
              : "text-muted"
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
        <span className="font-semibold text-foreground">
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
        <span
          className={`font-semibold ${signedValueClassName(transaction.amount.amount)}`}
        >
          {formatMoney(transaction.amount)}
        </span>
      ),
    },
  ];

  return (
    <main className="app-main">
      <div className="app-page">

        {summaryError ? (
          <section className="mt-6 rounded-md border border-error-border bg-surface p-4 text-sm text-error-text shadow-sm">
            {summaryError}
          </section>
        ) : null}

        {isSummaryLoading ? (
          <div className="mt-4 text-sm font-medium text-content-tertiary">
            Updating dividend summary...
          </div>
        ) : null}

        <section className="app-panel p-4 mt-6">
          <FilterBar
            accounts={dashboard.accounts}
            value={filters}
            onChange={setFilters}
          />
        </section>

        <section className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <DividendTotalBarChart totals={summary.metrics.totalDividends} />
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              label="Annual dividend income"
              value={<MetricValueList rows={formatMoneyMetricRows(summary.metrics.annualIncome)} />}
              align="center"
            />
            <StatCard
              label="Monthly dividend income"
              value={<MetricValueList rows={formatMoneyMetricRows(summary.metrics.monthlyIncome)} />}
              align="center"
            />
            <StatCard
              label="Current yield"
              value={
                <MetricValueList rows={formatPercentMetricRows(summary.metrics.currentYieldByCurrency)} />
              }
              align="center"
            />
            <StatCard
              label="Yield on cost"
              value={
                <MetricValueList rows={formatPercentMetricRows(summary.metrics.yieldOnCostByCurrency)} />
              }
              align="center"
            />
          </div>
        </section>

        <section className="mt-6">
          <DividendMonthlyGrowthChart transactions={summary.transactions} />
        </section>

        <section className="mt-6">
          <DividendCurrentYearChart
            transactions={currentYearDividendTransactions}
            futureMonthlyIncome={summary.metrics.monthlyIncome}
          />
        </section>

        <section className="mt-6">
          <DividendAccountShareChart groups={summary.accountShareGroups} />
        </section>

        <section className="mt-6">
          <DividendPositionYieldChart rows={summary.positionYields} accounts={dashboard.accounts} />
        </section>

        <section className="mt-6">
          <DividendGrowthChart transactions={summary.transactions} />
        </section>

        <section className="app-panel mt-6 p-4">
          <SegmentedTabs<DividendTableTab>
            value={activeTableTab}
            onChange={setActiveTableTab}
            options={[
              {
                id: "positions",
                label: "Positions",
                count: summary.positionRows.length,
              },
              {
                id: "transactions",
                label: "Transactions",
                count: summary.transactions.length,
              },
              {
                id: "calendar",
                label: "Calendar",
                count: summary.calendarEvents.length,
              },
            ]}
          />
        </section>

        <section className="mt-6">
          {activeTableTab === "positions" ? (
            <DataTable
              title="Dividend yielding positions"
              rows={summary.positionRows}
              columns={positionColumns}
              getRowKey={(position) => position.id}
              emptyMessage="No dividend yielding positions match this view."
            />
          ) : null}

          {activeTableTab === "transactions" ? (
            <DataTable
              title="Dividend transactions"
              rows={summary.transactions}
              columns={transactionColumns}
              getRowKey={(transaction) => transaction.id}
              emptyMessage="No dividend transactions match this view."
            />
          ) : null}

          {activeTableTab === "calendar" ? (
            <DividendEventsCalendar events={summary.calendarEvents} />
          ) : null}
        </section>
      </div>
    </main>
  );
}
