"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { TotalDividendsChart } from "../components/charts/totalDividendChart";
import { DividendDistributionChart } from "../components/charts/dividendDistributionChart";
import { AllocationPieChart } from "../components/charts/allocationPieChart";
import { DividendMonthlyGrowthChart } from "../components/charts/dividendMonthlyGrowthChart";
import { DividendAccountShareChart } from "../components/charts/dividendAccountShareChart";
import { DividendPositionYieldChart } from "../components/charts/dividendPositionYieldChart";
import { DividendEventsCalendar } from "../components/portfolio/dividendEventsCalendar";
import { MetricValueList } from "../components/dashboard/metricValueList";
import { useSessionState } from "../state/sessionState";
import { queryKeys } from "../state/queryKeys";
import { buildPositionAllocationSlices } from "../services/portfolio";

type DividendsPageProps = {
  dashboard: PortfolioDashboardDto;
  initialSummary: DividendDashboardSummaryDto;
};

type DividendTableTab = "positions" | "transactions" | "calendar";

async function fetchDividendSummary(
  timeline: string,
  accountIds: string[]
): Promise<DividendDashboardSummaryDto> {
  const params = new URLSearchParams();
  params.set("timeline", timeline);
  params.set("accountIds", accountIds.join(","));

  const response = await fetch(`/api/dividends/summary?${params.toString()}`);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? "Unable to load dividend summary.");
  }

  return response.json() as Promise<DividendDashboardSummaryDto>;
}

export function DividendsPage({
  dashboard,
  initialSummary,
}: DividendsPageProps) {
  const [filters, setFilters] = useSessionState(
    "dividends:filters",
    defaultFilterBarState
  );
  const [activeTableTab, setActiveTableTab] =
    useSessionState<DividendTableTab>("dividends:active-tab", "positions");

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const selectedAccountIds = useMemo(() => {
    return dashboard.accounts
      .filter((account) => accountMatchesFilters(account, filters))
      .map((account) => account.id)
      .sort();
  }, [dashboard.accounts, filters]);

  const selectedAccountIdSet = useMemo(
    () => new Set(selectedAccountIds),
    [selectedAccountIds]
  );
  const pieSlices = useMemo(
    () => buildPositionAllocationSlices(
      dashboard.positions.filter((position) => selectedAccountIdSet.has(position.accountId))
    ),
    [dashboard.positions, selectedAccountIdSet]
  );
  const currentYearDividendTransactions = useMemo(() => {
    return dashboard.dividends.transactions.filter((transaction) =>
      selectedAccountIdSet.has(transaction.accountId)
    );
  }, [dashboard.dividends.transactions, selectedAccountIdSet]);

  const usesInitialSummary =
    filters.timeline === "ALL" &&
    filters.accountIds.length === 0 &&
    filters.accountTypes.length === 0 &&
    filters.brokerages.length === 0;
  const summaryQuery = useQuery({
    queryKey: queryKeys.dividendSummary(filters.timeline, selectedAccountIds),
    queryFn: () => fetchDividendSummary(filters.timeline, selectedAccountIds),
    initialData: usesInitialSummary ? initialSummary : undefined,
    placeholderData: (previousSummary: DividendDashboardSummaryDto | undefined) =>
      previousSummary ?? initialSummary,
  });
  const summary = summaryQuery.data ?? initialSummary;
  const summaryError = summaryQuery.error instanceof Error
    ? summaryQuery.error.message
    : summaryQuery.error
      ? "Unable to load dividend summary."
      : null;
  const isSummaryLoading = summaryQuery.isFetching;

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

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        </section>

        <section className="mt-6">
          <TotalDividendsChart
            transactions={summary.transactions}
            totals={summary.metrics.totalDividends}
          />
        </section>

        <section className="mt-6">
          <AllocationPieChart title="Position allocation" rows={pieSlices} />
        </section>

        <section className="mt-6">
          <DividendDistributionChart positions={summary.positionYields} />
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
              stateKey="dividends:positions"
              rows={summary.positionRows}
              columns={positionColumns}
              getRowKey={(position) => position.id}
              emptyMessage="No dividend yielding positions match this view."
            />
          ) : null}

          {activeTableTab === "transactions" ? (
            <DataTable
              title="Dividend transactions"
              stateKey="dividends:transactions"
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
