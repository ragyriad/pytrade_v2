"use client";

import { useMemo, useState } from "react";
import {
  accountMatchesFilters,
  defaultFilterBarState,
} from "../lib/accountFilters";
import {
  formatDate,
  formatMoney,
  formatMoneyBreakdown,
  signedValueClassName,
} from "../lib/formatters";
import type {
  AccountDto,
  PortfolioDashboardDto,
  TransactionDto,
} from "../lib/portfolioTypes";
import {
  filterCostTransactions,
  getCostKinds,
  getCostTypeLabel,
  getFeeMoney,
  getFeeTotals,
  getTaxMoney,
  getTaxTotals,
  isFeeTransaction,
  isTaxTransaction,
  type CostKind,
  type CostView,
} from "../services/costs";
import { filterTransactionsByTimeline } from "../services/filter_timeline";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { FilterBar } from "../components/dashboard/filterBar";
import { StatCard } from "../components/dashboard/statCard";
import { CostsMonthlyChart } from "../components/charts/costsMonthlyChart";

type CostsPageProps = {
  dashboard: PortfolioDashboardDto;
};

function isNonCashAccount(account: AccountDto): boolean {
  if (typeof account.isInvestmentAccount === "boolean") {
    return account.isInvestmentAccount;
  }

  const classification = `${account.type ?? ""} ${account.name}`.toLowerCase();
  return !/\b(?:cash|credit|card|msb)\b/.test(classification);
}

function CostTypeBadge({ kind }: { kind: CostKind }) {
  const className =
    kind === "fee"
      ? "border-error-border bg-error-surface text-error-text"
      : "border-warning-border-subtle bg-warning-surface text-warning-text-medium";

  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
      {kind === "fee" ? "Fee" : "Tax"}
    </span>
  );
}

export function CostsPage({ dashboard }: CostsPageProps) {
  const [filters, setFilters] = useState(defaultFilterBarState);
  const [costView, setCostView] = useState<CostView>("both");

  const nonCashAccounts = useMemo(
    () => dashboard.accounts.filter(isNonCashAccount),
    [dashboard.accounts]
  );
  const accountsById = useMemo(
    () => new Map(nonCashAccounts.map((account) => [account.id, account])),
    [nonCashAccounts]
  );

  const accountCostTransactions = useMemo(() => {
    const matchingTransactions = dashboard.transactions.filter((transaction) => {
      const account = accountsById.get(transaction.accountId);
      return accountMatchesFilters(account, filters);
    });

    return filterCostTransactions(matchingTransactions, "both");
  }, [accountsById, dashboard.transactions, filters]);

  const timelineCostTransactions = useMemo(
    () => filterTransactionsByTimeline(accountCostTransactions, filters.timeline),
    [accountCostTransactions, filters.timeline]
  );
  const feeTransactions = useMemo(
    () => timelineCostTransactions.filter(isFeeTransaction),
    [timelineCostTransactions]
  );
  const taxTransactions = useMemo(
    () => timelineCostTransactions.filter(isTaxTransaction),
    [timelineCostTransactions]
  );
  const visibleTransactions = useMemo(
    () => filterCostTransactions(timelineCostTransactions, costView),
    [costView, timelineCostTransactions]
  );
  const totalFees = useMemo(() => getFeeTotals(feeTransactions), [feeTransactions]);
  const totalTaxes = useMemo(() => getTaxTotals(taxTransactions), [taxTransactions]);
  const zeroValue = {
    amount: 0,
    currency: dashboard.summary.totalValue.currency || "USD",
  };

  const columns: TableColumn<TransactionDto>[] = [
    {
      key: "date",
      header: "Date",
      value: (transaction) => new Date(transaction.tradeDate),
      render: (transaction) => formatDate(transaction.tradeDate),
    },
    {
      key: "account",
      header: "Account",
      value: (transaction) => accountsById.get(transaction.accountId)?.name,
      render: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
    },
    {
      key: "brokerage",
      header: "Brokerage",
      value: (transaction) => accountsById.get(transaction.accountId)?.institutionName,
      render: (transaction) =>
        accountsById.get(transaction.accountId)?.institutionName ?? "Unknown",
    },
    {
      key: "costType",
      header: "Cost type",
      value: getCostTypeLabel,
      render: (transaction) => (
        <span className="inline-flex flex-wrap justify-center gap-1">
          {getCostKinds(transaction).map((kind) => (
            <CostTypeBadge key={kind} kind={kind} />
          ))}
        </span>
      ),
    },
    {
      key: "symbol",
      header: "Symbol",
      value: (transaction) => transaction.symbol,
      render: (transaction) => transaction.symbol ?? "-",
    },
    {
      key: "amount",
      header: "Cost",
      align: "right",
      value: (transaction) =>
        isTaxTransaction(transaction)
          ? getTaxMoney(transaction).amount
          : getFeeMoney(transaction).amount,
      render: (transaction) => {
        const cost = isTaxTransaction(transaction)
          ? getTaxMoney(transaction)
          : getFeeMoney(transaction);
        return (
          <span className={signedValueClassName(-cost.amount)}>{formatMoney(cost)}</span>
        );
      },
    },
    {
      key: "description",
      header: "Description",
      value: (transaction) => transaction.description,
      render: (transaction) => (
        <span className="line-clamp-2 text-content-secondary">{transaction.description ?? "-"}</span>
      ),
    },
  ];

  const tableTitle =
    costView === "fees"
      ? "Fee transactions"
      : costView === "taxes"
        ? "Tax transactions"
        : "Fee and tax transactions";

  return (
    <main className="app-main">
      <div className="app-page">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">Costs</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted">
            Review fees and taxes from non-cash accounts.
          </p>
        </header>

        <section className="app-panel p-4">
          <FilterBar
            accounts={nonCashAccounts}
            value={filters}
            onChange={setFilters}
            costType={{ value: costView, onChange: setCostView }}
          />
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Fee transactions"
            value={String(feeTransactions.length)}
            align="center"
          />
          <StatCard
            label="Total fees"
            value={formatMoneyBreakdown(totalFees, zeroValue)}
            tone="negative"
            align="center"
          />
          <StatCard
            label="Tax transactions"
            value={String(taxTransactions.length)}
            align="center"
          />
          <StatCard
            label="Total tax"
            value={formatMoneyBreakdown(totalTaxes, zeroValue)}
            tone="negative"
            align="center"
          />
        </section>

        <section className="mt-6">
          <CostsMonthlyChart transactions={visibleTransactions} view={costView} />
        </section>

        <section className="mt-6">
          <DataTable
            title={tableTitle}
            rows={visibleTransactions}
            columns={columns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No fee or tax transactions match the selected filters."
          />
        </section>
      </div>
    </main>
  );
}
