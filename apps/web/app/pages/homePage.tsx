"use client";

import { useMemo, useState } from "react";
import { AllocationPieChart } from "../components/charts/allocationPieChart";
import { PerformanceChart } from "../components/charts/performanceChart";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { FilterBar } from "../components/dashboard/filterBar";
import { StatCard } from "../components/dashboard/statCard";
import {
  accountMatchesFilters,
  defaultFilterBarState,
  isActiveAccount,
} from "../lib/accountFilters";
import {
  formatMoney,
  formatMoneyBreakdown,
  formatNumber,
  formatPercent,
  signedValueClassName,
} from "../lib/formatters";
import {
  getAggregateUnrealizedAmount,
  getAggregateUnrealizedPercent,
  buildPositionAllocationSlices,
  getTotalMarketValue,
  getTotalUnrealized,
  getUnrealizedReturnPercent,
} from "../services/portfolio";
import type { PortfolioDashboardDto, PositionDto } from "../lib/portfolioTypes";

type HomePageProps = {
  dashboard: PortfolioDashboardDto;
};

export function HomePage({ dashboard }: HomePageProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);

  const accountsById = useMemo(() => {
    return new Map(dashboard.accounts.map((account) => [account.id, account]));
  }, [dashboard.accounts]);

  const activeAccounts = useMemo(() => {
    return dashboard.accounts.filter(
      (account) => isActiveAccount(account) && account.isInvestmentAccount !== false
    );
  }, [dashboard.accounts]);

  const activePositions = useMemo(() => {
    return dashboard.positions.filter((position) => {
      const account = accountsById.get(position.accountId);
      return isActiveAccount(account) && accountMatchesFilters(account, filters);
    });
  }, [accountsById, dashboard.positions, filters]);

  const pieSlices = useMemo(
    () => buildPositionAllocationSlices(activePositions),
    [activePositions]
  );

  const totalMarketValue = useMemo(() => getTotalMarketValue(activePositions), [activePositions]);
  const totalUnrealized = useMemo(() => getTotalUnrealized(activePositions), [activePositions]);
  const totalUnrealizedAmount = useMemo(
    () => getAggregateUnrealizedAmount(activePositions),
    [activePositions]
  );
  const filteredUnrealizedPercent = useMemo(
    () => getAggregateUnrealizedPercent(activePositions),
    [activePositions]
  );
  const totalAllocationValue = useMemo(
    () => activePositions.reduce((sum, position) => sum + position.marketValue.amount, 0),
    [activePositions]
  );

  const positionColumns: TableColumn<PositionDto>[] = [
    {
      key: "symbol",
      header: "Symbol",
      render: (position) => <span className="font-semibold text-foreground">{position.symbol}</span>,
    },
    {
      key: "description",
      header: "Description",
      render: (position) => (
        <span className="line-clamp-1 text-content-secondary">
          {position.description ?? position.assetType ?? "Position"}
        </span>
      ),
    },
    {
      key: "account",
      header: "Account",
      render: (position) => accountsById.get(position.accountId)?.name ?? "Unknown",
    },
    {
      key: "units",
      header: "Units",
      align: "right",
      render: (position) => formatNumber(position.units),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      render: (position) => position.price ? formatMoney(position.price) : "-",
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      render: (position) => (
        <span className={`font-medium ${signedValueClassName(position.marketValue.amount)}`}>
          {formatMoney(position.marketValue)}
        </span>
      ),
    },
    {
      key: "allocation",
      header: "Allocation %",
      align: "right",
      value: (position) =>
        totalAllocationValue > 0
          ? (position.marketValue.amount / totalAllocationValue) * 100
          : 0,
      render: (position) => (
        <span className="text-foreground">
          {formatPercent(
            totalAllocationValue > 0
              ? (position.marketValue.amount / totalAllocationValue) * 100
              : 0
          )}
        </span>
      ),
    },
    {
      key: "pnl",
      header: "Unrealized",
      align: "right",
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

  return (
    <main className="app-main">
      <div className="app-page">
        <section className="app-panel p-4">
          <FilterBar accounts={activeAccounts} value={filters} onChange={setFilters} />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Filtered market value"
            value={formatMoneyBreakdown(totalMarketValue, dashboard.summary.totalValue)}
          />
          <StatCard
            label="Unrealized gain/loss"
            value={formatMoneyBreakdown(totalUnrealized, dashboard.summary.totalUnrealizedGainLoss)}
            tone={totalUnrealizedAmount > 0 ? "positive" : totalUnrealizedAmount < 0 ? "negative" : "neutral"}
          />
          <StatCard
            label="Unrealized return"
            value={filteredUnrealizedPercent == null ? "-" : formatPercent(filteredUnrealizedPercent)}
            tone={
              filteredUnrealizedPercent == null
                ? "neutral"
                : filteredUnrealizedPercent > 0
                  ? "positive"
                  : filteredUnrealizedPercent < 0
                    ? "negative"
                    : "neutral"
            }
          />
          <StatCard label="Active positions" value={String(activePositions.length)} />
        </section>

        <section className="mt-6">
          <PerformanceChart performance={dashboard.performance} />
        </section>

        <section className="mt-6">
          <AllocationPieChart title="Position allocation" rows={pieSlices} />
        </section>

        <section className="mt-6">
          <DataTable
            title="Active positions"
            rows={activePositions}
            columns={positionColumns}
            getRowKey={(position) => position.id}
            emptyMessage="No active positions match the selected filters."
          />
        </section>
      </div>
    </main>
  );
}
