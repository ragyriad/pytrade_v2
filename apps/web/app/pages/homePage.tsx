"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PerformanceChart } from "../components/charts/performanceChart";
import { SecurityTypeAllocationChart } from "../components/charts/securityTypeAllocationChart";
import { PortfolioDividendCoverageChart } from "../components/charts/portfolioDividendCoverageChart";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { FilterBar } from "../components/dashboard/filterBar";
import { StatCard } from "../components/dashboard/statCard";
import { accountMatchesFilters, defaultFilterBarState } from "../lib/accountFilters";
import { formatMoneyBreakdown, formatNumber, formatPercent } from "../lib/formatters";
import {
  getAggregateUnrealizedAmount,
  getAggregateUnrealizedPercent,
  getTotalMarketValue,
  getTotalUnrealized,
  getUnrealizedReturnPercent,
} from "../services/portfolio";
import type { DividendDashboardSummaryDto, HistoricSecurityDto, PortfolioDashboardDto, PositionDto } from "../lib/portfolioTypes";
import { useSessionState } from "../state/sessionState";
import { queryKeys } from "../state/queryKeys";

type HomePageProps = { dashboard: PortfolioDashboardDto; historicSecurities: HistoricSecurityDto[] };
type PortfolioRow = {
  key: string;
  symbol: string;
  description: string | null;
  currency: string;
  positions: PositionDto[];
  closed: boolean;
};

const numberFormatter = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyNumber = (amount: number) => numberFormatter.format(Math.abs(amount));
const DEFAULT_POSITION_SORTING = [{ id: "allocation", desc: true }];
function averagePositionPrice(positions: PositionDto[]) {
  const priced = positions.filter((position) => position.price != null);
  const units = priced.reduce((sum, position) => sum + position.units, 0);
  return units > 0
    ? priced.reduce((sum, position) => sum + (position.price?.amount ?? 0) * position.units, 0) / units
    : null;
}

function renderPositionTypeTag(value: string | null | undefined) {
  const label = value?.trim() || "Unclassified";
  const paletteIndex = Array.from(label.toLocaleLowerCase()).reduce(
    (hash, character) => (hash * 31 + (character.codePointAt(0) ?? 0)) % 8,
    0
  ) + 1;
  return <span className="inline-flex max-w-40 truncate rounded px-2 py-1 text-xs font-medium" style={{ backgroundColor: `var(--color-tag-${paletteIndex}-surface)`, color: `var(--color-tag-${paletteIndex}-text)` }} title={label}>{label}</span>;
}

export function HomePage({ dashboard, historicSecurities }: HomePageProps) {
  const [filters, setFilters] = useSessionState("portfolio:filters", defaultFilterBarState);
  const [showClosed, setShowClosed] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const accountsById = useMemo(() => new Map(dashboard.accounts.map((account) => [account.id, account])), [dashboard.accounts]);
  const activeAccounts = useMemo(() => dashboard.accounts.filter((account) => account.type === "Investment"), [dashboard.accounts]);
  const activePositions = useMemo(() => dashboard.positions.filter((position) => {
    const account = accountsById.get(position.accountId);
    return account?.type === "Investment" && accountMatchesFilters(account, filters);
  }), [accountsById, dashboard.positions, filters]);
  const filteredAccounts = useMemo(() => activeAccounts.filter((account) => accountMatchesFilters(account, filters)), [activeAccounts, filters]);
  const selectedAccountIds = useMemo(() => filteredAccounts.map((account) => account.id).sort(), [filteredAccounts]);
  const dividendSummaryQuery = useQuery({
    queryKey: queryKeys.dividendSummary("ALL", selectedAccountIds),
    queryFn: async () => {
      const params = new URLSearchParams({ timeline: "ALL", accountIds: selectedAccountIds.join(",") });
      const response = await fetch(`/api/dividends/summary?${params.toString()}`);
      if (!response.ok) throw new Error("Unable to load current dividend yields.");
      return response.json() as Promise<DividendDashboardSummaryDto>;
    },
    enabled: selectedAccountIds.length > 0,
  });
  const totalMarketValue = useMemo(() => getTotalMarketValue(activePositions), [activePositions]);
  const totalUnrealized = useMemo(() => getTotalUnrealized(activePositions), [activePositions]);
  const totalUnrealizedAmount = useMemo(() => getAggregateUnrealizedAmount(activePositions), [activePositions]);
  const filteredUnrealizedPercent = useMemo(() => getAggregateUnrealizedPercent(activePositions), [activePositions]);

  const portfolioRows = useMemo(() => {
    const groups = new Map<string, PortfolioRow>();
    for (const position of activePositions) {
      const currency = position.marketValue.currency || "USD";
      const key = `${position.symbol.trim().toUpperCase()}|${currency.toUpperCase()}`;
      const existing = groups.get(key);
      if (existing) existing.positions.push(position);
      else groups.set(key, { key, symbol: position.symbol, description: position.description, currency, positions: [position], closed: false });
    }

    if (showClosed) {
      for (const security of historicSecurities) {
        if (security.status !== "closed") continue;
        const currency = security.currencyCode || "USD";
        const key = `${security.symbol.trim().toUpperCase()}|${currency.toUpperCase()}`;
        if (groups.has(key)) continue;
        const linked = (security.accounts ?? []).filter((account) => {
          const current = accountsById.get(account.id);
          return current?.type === "Investment" && accountMatchesFilters(current, filters);
        });
        if (linked.length === 0) continue;
        const positions: PositionDto[] = linked.map((account, index) => ({
          id: `closed:${security.id}:${index}`, accountId: account.id, securityId: security.id,
          symbol: security.symbol, description: security.description, units: 0, price: null,
          marketValue: { amount: 0, currency }, averagePurchasePrice: null, unrealizedGainLoss: null,
          assetType: security.instrumentType, isCashEquivalent: false,
        }));
        groups.set(key, { key, symbol: security.symbol, description: security.description, currency, positions, closed: true });
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.symbol.localeCompare(b.symbol) || a.currency.localeCompare(b.currency));
  }, [activePositions, historicSecurities, showClosed, accountsById, filters]);

  const portfolioAllocationByCurrency = useMemo(() => {
    return portfolioRows.filter((row) => !row.closed).reduce((sum, row) => sum + row.positions.reduce((value, position) => value + position.marketValue.amount, 0), 0);
  }, [portfolioRows]);

  const securityTypeSlices = useMemo(() => {
    const totals = new Map<string, { type: string; currency: string; value: number }>();
    for (const position of activePositions) {
      const type = position.isCashEquivalent ? "Cash" : position.assetType?.trim() || "Unclassified";
      const currency = position.marketValue.currency || "USD";
      const key = `${type}|${currency}`;
      const current = totals.get(key);
      totals.set(key, { type, currency, value: (current?.value ?? 0) + position.marketValue.amount });
    }
    const positiveValues = Array.from(totals.values()).filter((row) => row.value > 0);
    const totalsByCurrency = new Map<string, number>();
    for (const row of positiveValues) totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.value);
    return positiveValues.map((row) => ({
      label: row.type,
      value: row.value,
      currency: row.currency,
      percentage: (totalsByCurrency.get(row.currency) ?? 0) > 0 ? row.value / (totalsByCurrency.get(row.currency) ?? 1) * 100 : 0,
    })).sort((a, b) => b.value - a.value);
  }, [activePositions]);

  const dividendCoverage = useMemo(() => {
    const securities = new Map<string, { symbol: string; currency: string; value: number; accountIds: Set<string> }>();
    for (const position of activePositions) {
      if (position.units <= 0 || position.isCashEquivalent) continue;
      const currency = position.marketValue.currency || "USD";
      const key = `${position.symbol.trim().toUpperCase()}|${currency.toUpperCase()}`;
      const existing = securities.get(key);
      if (existing) {
        existing.accountIds.add(position.accountId);
        existing.value += position.marketValue.amount;
      } else securities.set(key, { symbol: position.symbol, currency, value: position.marketValue.amount, accountIds: new Set([position.accountId]) });
    }
    const currentYieldAccounts = new Set(
      (dividendSummaryQuery.data?.currentYieldPositions ?? [])
        .filter((row) => row.currentYieldPercent > 0 && selectedAccountIds.includes(row.accountId))
        .map((row) => `${row.symbol.trim().toUpperCase()}|${row.accountId}`)
    );
    const totalsByCurrency = new Map<string, { withYieldValue: number; withoutYieldValue: number }>();
    for (const security of securities.values()) {
      const totals = totalsByCurrency.get(security.currency) ?? { withYieldValue: 0, withoutYieldValue: 0 };
      const hasYield = Array.from(security.accountIds).some((accountId) => currentYieldAccounts.has(`${security.symbol.trim().toUpperCase()}|${accountId}`));
      if (hasYield) totals.withYieldValue += security.value;
      else totals.withoutYieldValue += security.value;
      totalsByCurrency.set(security.currency, totals);
    }
    return Array.from(totalsByCurrency, ([currency, values]) => ({ currency, ...values }));
  }, [activePositions, dividendSummaryQuery.data, selectedAccountIds]);

  const columns: TableColumn<PortfolioRow>[] = [
    { key: "symbol", header: "Symbol", render: (row) => <span className={`inline-flex rounded px-2.5 py-1 text-xs font-semibold ${row.closed ? "bg-error-surface text-error-text" : "bg-tag-2-surface text-tag-2-text"}`} aria-label={`${row.symbol}, ${row.closed ? "closed" : "open"}`} title={row.closed ? "Closed position" : "Open position"}>{row.symbol}</span> },
    { key: "currency", header: "Currency", render: (row) => row.currency },
    { key: "positionType", header: "Position Type", value: (row) => row.positions.find((position) => position.assetType)?.assetType ?? "Unclassified", render: (row) => renderPositionTypeTag(row.positions.find((position) => position.assetType)?.assetType) },
    { key: "units", header: "Units", align: "right", value: (row) => row.positions.reduce((sum, position) => sum + position.units, 0), render: (row) => formatNumber(row.positions.reduce((sum, position) => sum + position.units, 0)) },
    { key: "price", header: "Price", align: "right", value: (row) => averagePositionPrice(row.positions), render: (row) => {
      const price = averagePositionPrice(row.positions);
      return price == null ? "-" : moneyNumber(price);
    } },
    { key: "value", header: "Value", align: "right", value: (row) => row.positions.reduce((sum, position) => sum + position.marketValue.amount, 0), render: (row) => <span className="font-medium text-foreground">{moneyNumber(row.positions.reduce((sum, position) => sum + position.marketValue.amount, 0))}</span> },
    { key: "allocation", header: "Allocation %", align: "right", value: (row) => portfolioAllocationByCurrency > 0 ? row.positions.reduce((acc, position) => acc + position.marketValue.amount, 0) / portfolioAllocationByCurrency * 100 : 0, render: (row) => formatPercent(portfolioAllocationByCurrency > 0 ? row.positions.reduce((acc, position) => acc + position.marketValue.amount, 0) / portfolioAllocationByCurrency * 100 : 0) },
    { key: "unrealized", header: "Unrealized", align: "right", render: (row) => {
      const amount = row.positions.reduce((sum, position) => sum + (position.unrealizedGainLoss?.amount ?? 0), 0);
      const cost = row.positions.reduce((sum, position) => sum + position.marketValue.amount - (position.unrealizedGainLoss?.amount ?? 0), 0);
      const percent = cost === 0 ? null : amount / cost * 100;
      return row.closed || row.positions.every((position) => !position.unrealizedGainLoss) ? "-" : <span className={`font-medium ${amount > 0 ? "text-positive" : amount < 0 ? "text-negative" : "text-foreground"}`}>{moneyNumber(amount)}{percent == null ? "" : ` (${formatPercent(percent)})`}</span>;
    } },
  ];

  const renderAccountDetails = (row: PortfolioRow) => {
    const positionsByAccount = new Map<string, PositionDto>();
    for (const position of row.positions) {
      const existing = positionsByAccount.get(position.accountId);
      if (!existing) positionsByAccount.set(position.accountId, { ...position });
      else positionsByAccount.set(position.accountId, {
        ...existing,
        units: existing.units + position.units,
        marketValue: { ...existing.marketValue, amount: existing.marketValue.amount + position.marketValue.amount },
        price: (() => {
          const units = existing.units + position.units;
          const weightedPrice = (existing.price?.amount ?? 0) * existing.units + (position.price?.amount ?? 0) * position.units;
          return units > 0 && (existing.price || position.price)
            ? { amount: weightedPrice / units, currency: row.currency }
            : null;
        })(),
        unrealizedGainLoss: existing.unrealizedGainLoss && position.unrealizedGainLoss
          ? { ...existing.unrealizedGainLoss, amount: existing.unrealizedGainLoss.amount + position.unrealizedGainLoss.amount }
          : existing.unrealizedGainLoss ?? position.unrealizedGainLoss,
      });
    }
    const perAccountTotals = new Map<string, number>();
    for (const position of activePositions) perAccountTotals.set(position.accountId, (perAccountTotals.get(position.accountId) ?? 0) + position.marketValue.amount);
    return <div className="mx-4 my-3 overflow-x-auto rounded-lg border-2 border-border bg-surface shadow-sm sm:mx-6">
      <table className="w-full min-w-[720px] border-collapse text-sm"><thead><tr className="border-b-2 border-border bg-tag-7-surface text-left text-xs uppercase tracking-wide text-tag-7-text"><th className="px-3 py-3">Account</th><th className="px-3 py-3">Currency</th><th className="px-3 py-3 text-right">Units</th><th className="px-3 py-3 text-right">Price</th><th className="px-3 py-3 text-right">Value</th><th className="px-3 py-3 text-right">Allocation %</th><th className="px-3 py-3 text-right">Unrealized</th></tr></thead><tbody>
        {Array.from(positionsByAccount.values()).map((position) => { const total = perAccountTotals.get(position.accountId) ?? 0; const pnl = position.unrealizedGainLoss?.amount; const percent = getUnrealizedReturnPercent(position); return <tr key={position.id} className="border-b border-border last:border-b-0"><td className="px-3 py-3 font-medium text-foreground">{accountsById.get(position.accountId)?.name ?? "Unknown"}</td><td className="px-3 py-3">{position.marketValue.currency}</td><td className="px-3 py-3 text-right">{formatNumber(position.units)}</td><td className="px-3 py-3 text-right">{position.price ? moneyNumber(position.price.amount) : "-"}</td><td className="px-3 py-3 text-right">{moneyNumber(position.marketValue.amount)}</td><td className="px-3 py-3 text-right">{formatPercent(total > 0 ? position.marketValue.amount / total * 100 : 0)}</td><td className="px-3 py-3 text-right">{pnl == null ? "-" : <span className={`font-medium ${pnl > 0 ? "text-positive" : pnl < 0 ? "text-negative" : "text-foreground"}`}>{moneyNumber(pnl)}{percent == null ? "" : ` (${formatPercent(percent)})`}</span>}</td></tr>; })}
      </tbody></table>
    </div>;
  };

  return <main className="app-main"><div className="app-page">
    <section className="app-panel p-4"><FilterBar accounts={activeAccounts} value={filters} onChange={setFilters} /></section>
    <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <StatCard label="Filtered market value" value={formatMoneyBreakdown(totalMarketValue, { amount: 0, currency: dashboard.summary.totalValue.currency })} />
      <StatCard label="Unrealized gain/loss" value={formatMoneyBreakdown(totalUnrealized, { amount: 0, currency: dashboard.summary.totalUnrealizedGainLoss.currency })} tone={totalUnrealizedAmount > 0 ? "positive" : totalUnrealizedAmount < 0 ? "negative" : "neutral"} />
      <StatCard label="Unrealized return" value={filteredUnrealizedPercent == null ? "-" : formatPercent(filteredUnrealizedPercent)} tone={filteredUnrealizedPercent == null ? "neutral" : filteredUnrealizedPercent > 0 ? "positive" : filteredUnrealizedPercent < 0 ? "negative" : "neutral"} />
      <StatCard label="Active positions" value={String(activePositions.length)} />
    </section>
    <section className="mt-6"><PerformanceChart performance={dashboard.performance} accountIds={filteredAccounts.map((account) => account.id)} timeline={filters.timeline} /></section>
    <section className="mt-6 grid gap-6 lg:grid-cols-2">
      <SecurityTypeAllocationChart rows={securityTypeSlices} />
      <PortfolioDividendCoverageChart
        rows={dividendCoverage}
        isLoading={dividendSummaryQuery.isLoading}
        hasError={dividendSummaryQuery.isError}
      />
    </section>
    <section className="mt-6"><DataTable title="Positions" stateKey="portfolio:active-positions" rows={portfolioRows} columns={columns} getRowKey={(row) => row.key} emptyMessage="No positions match the selected filters." defaultSorting={DEFAULT_POSITION_SORTING} transparentRows
      searchAccessory={<label className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm text-content-secondary"><input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} />Show Closed</label>}
      onRowClick={(row) => { if (new Set(row.positions.map((position) => position.accountId)).size <= 1) return; setExpandedKeys((current) => { const next = new Set(current); next.has(row.key) ? next.delete(row.key) : next.add(row.key); return next; }); }}
      isRowClickable={(row) => new Set(row.positions.map((position) => position.accountId)).size > 1}
      isRowExpanded={(row) => expandedKeys.has(row.key)} renderExpandedRow={(row) => new Set(row.positions.map((position) => position.accountId)).size > 1 ? renderAccountDetails(row) : null} /></section>
  </div></main>;
}
