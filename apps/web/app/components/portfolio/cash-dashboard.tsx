"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faCalendarDays,
  faCheck,
  faChevronDown,
  faCreditCard,
  faFilter,
  faLayerGroup,
  faMoneyBillWave,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { DetailsDropdown } from "../ui/details-dropdown";
import { DataTable, type TableColumn } from "../dashboard/data-table";
import { MetricValueList } from "../dashboard/metric-value-list";
import { StatCard } from "../dashboard/stat-card";
import { SelectField } from "../ui/select";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
} from "../../lib/formatters";
import {
  filterTransactionsByTimeline,
  timelineOptions,
  type TimelineRange,
} from "../../services/filter_timeline";
import type {
  CashAccountDto,
  CashDashboardDto,
  CashTransactionDto,
  MoneyDto,
} from "../../lib/portfolio-types";

type CashDashboardProps = {
  dashboard: CashDashboardDto;
};

type CashFilterState = {
  brokerages: string[];
  accountIds: string[];
  accountTypes: string[];
  timeline: TimelineRange;
};

type CashFilterMultiSelectProps = {
  label: string;
  icon: typeof faFilter;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
};

const defaultFilters: CashFilterState = {
  brokerages: [],
  accountIds: [],
  accountTypes: [],
  timeline: "ALL",
};

function accountBrokerage(account: CashAccountDto): string {
  return account.institutionName ?? "Unknown";
}

function accountType(account: CashAccountDto): string {
  return account.type ?? (account.category === "credit" ? "Credit card" : "Cash");
}

function accountMatchesFilters(
  account: CashAccountDto | undefined,
  filters: CashFilterState
): boolean {
  if (!account) return false;

  return (
    (filters.brokerages.length === 0 ||
      filters.brokerages.includes(accountBrokerage(account))) &&
    (filters.accountIds.length === 0 || filters.accountIds.includes(account.id)) &&
    (filters.accountTypes.length === 0 ||
      filters.accountTypes.includes(accountType(account)))
  );
}

function groupMoney(values: MoneyDto[]) {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

function isInterestTransaction(transaction: CashTransactionDto): boolean {
  const label = `${transaction.action ?? ""} ${transaction.type}`.toUpperCase();
  return label.includes("INTEREST");
}

function isOutflowTransaction(transaction: CashTransactionDto): boolean {
  if (transaction.amount.amount < 0) return true;

  const label = `${transaction.action ?? ""} ${transaction.type} ${
    transaction.description ?? ""
  }`.toUpperCase();
  const inflowLabels = ["DEPOSIT", "CONTRIBUTION", "INTEREST", "REFUND", "REIMBURSEMENT"];
  if (inflowLabels.some((term) => label.includes(term))) return false;

  return ["WITHDRAW", "SPEND", "PURCHASE", "CHARGE", "DEBIT", "FEE"].some((term) =>
    label.includes(term)
  );
}

function getCurrentInterestRates(
  transactions: CashTransactionDto[],
  cashAccounts: CashAccountDto[]
): Array<{ currency: string; percent: number | null }> {
  const balances = groupMoney(cashAccounts.map((account) => account.balance));
  const latestTransactionTime = Math.max(
    0,
    ...transactions.map((transaction) => new Date(transaction.tradeDate).getTime())
  );

  if (latestTransactionTime === 0) {
    return balances.map((balance) => ({ currency: balance.currency, percent: null }));
  }

  const latest = new Date(latestTransactionTime);
  const windowStart = new Date(latest);
  windowStart.setDate(windowStart.getDate() - 30);
  const interestByCurrency = groupMoney(
    transactions
      .filter((transaction) => {
        const tradeDate = new Date(transaction.tradeDate);
        return isInterestTransaction(transaction) && tradeDate >= windowStart && tradeDate <= latest;
      })
      .map((transaction) => ({
        amount: Math.abs(transaction.amount.amount),
        currency: transaction.amount.currency,
      }))
  );
  const interestMap = new Map(interestByCurrency.map((row) => [row.currency, row.amount]));

  return balances.map((balance) => ({
    currency: balance.currency,
    percent:
      balance.amount > 0 && (interestMap.get(balance.currency) ?? 0) > 0
        ? ((interestMap.get(balance.currency) ?? 0) / balance.amount) * (365 / 30) * 100
        : null,
  }));
}

function formatMoneyRows(values: MoneyDto[]) {
  return groupMoney(values).map((value) => ({
    id: value.currency,
    value: formatNumber(value.amount),
    suffix: value.currency,
  }));
}

function formatInterestRows(values: Array<{ currency: string; percent: number | null }>) {
  return values.map((value) => ({
    id: value.currency,
    value: value.percent == null ? "-" : formatPercent(value.percent),
    suffix: value.currency,
  }));
}

function CashFilterMultiSelect({
  label,
  icon,
  emptyLabel,
  options,
  value,
  onChange,
  className,
}: CashFilterMultiSelectProps) {
  const selected = new Set(value);
  const buttonLabel =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? options.find((option) => option.value === value[0])?.label ?? value[0]
        : `${value.length} selected`;

  const toggleValue = (nextValue: string) => {
    onChange(
      selected.has(nextValue)
        ? value.filter((item) => item !== nextValue)
        : [...value, nextValue]
    );
  };

  return (
    <div className={`relative max-w-full flex-none ${className ?? ""}`}>
      <div className="mb-1 inline-flex items-center gap-2 text-xs font-medium uppercase text-muted">
        <FontAwesomeIcon icon={icon} className="h-3 w-3" />
        {label}
      </div>
      <DetailsDropdown className="group relative">
        <summary className="app-control-focus flex h-10 w-full cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-left text-sm text-foreground shadow-sm outline-none transition hover:border-primary-200">
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <span className="flex items-center gap-2">
            {value.length > 0 ? (
              <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                {value.length}
              </span>
            ) : null}
            <FontAwesomeIcon
              icon={faChevronDown}
              className="h-3 w-3 text-muted transition group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="absolute left-0 z-40 mt-2 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-border bg-surface p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-border px-2 pb-2">
            <span className="text-xs font-semibold uppercase text-muted">{label}</span>
            {value.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-50"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                Clear
              </button>
            ) : null}
          </div>
          <div className="grid gap-1">
            {options.map((option) => {
              const checked = selected.has(option.value);

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm transition ${
                    checked
                      ? "bg-primary-50 text-primary-900"
                      : "text-foreground hover:bg-surface-muted"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-primary-700 bg-primary-700 text-white"
                        : "border-border bg-surface"
                    }`}
                  >
                    {checked ? <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </DetailsDropdown>
    </div>
  );
}

function CashFilterBar({
  accounts,
  value,
  onChange,
}: {
  accounts: CashAccountDto[];
  value: CashFilterState;
  onChange: (value: CashFilterState) => void;
}) {
  const brokerages = useMemo(
    () => Array.from(new Set(accounts.map(accountBrokerage))).sort(),
    [accounts]
  );
  const accountTypes = useMemo(
    () => Array.from(new Set(accounts.map(accountType))).sort(),
    [accounts]
  );
  const selectableAccounts = useMemo(() => {
    return accounts
      .filter((account) => {
        const brokerageMatch =
          value.brokerages.length === 0 ||
          value.brokerages.includes(accountBrokerage(account));
        const typeMatch =
          value.accountTypes.length === 0 ||
          value.accountTypes.includes(accountType(account));
        return brokerageMatch && typeMatch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, value.accountTypes, value.brokerages]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <CashFilterMultiSelect
        label="Brokerage"
        icon={faBuildingColumns}
        emptyLabel="All brokerages"
        options={brokerages.map((brokerage) => ({ value: brokerage, label: brokerage }))}
        value={value.brokerages}
        onChange={(brokerages) => onChange({ ...value, brokerages })}
        className="w-fit min-w-48"
      />
      <CashFilterMultiSelect
        label="Account"
        icon={faFilter}
        emptyLabel="All accounts"
        options={selectableAccounts.map((account) => ({
          value: account.id,
          label: account.name,
        }))}
        value={value.accountIds}
        onChange={(accountIds) => onChange({ ...value, accountIds })}
        className="w-fit min-w-64"
      />
      <CashFilterMultiSelect
        label="Account type"
        icon={faLayerGroup}
        emptyLabel="All types"
        options={accountTypes.map((type) => ({ value: type, label: type }))}
        value={value.accountTypes}
        onChange={(accountTypes) => onChange({ ...value, accountTypes })}
        className="w-fit min-w-40"
      />
      <SelectField
        label={
          <>
            <FontAwesomeIcon icon={faCalendarDays} className="h-3 w-3" />
            Timeline
          </>
        }
        value={value.timeline}
        onChange={(event) =>
          onChange({ ...value, timeline: event.target.value as TimelineRange })
        }
        className="min-w-40"
      >
        {timelineOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    </div>
  );
}

export function CashDashboard({ dashboard }: CashDashboardProps) {
  const [filters, setFilters] = useState(defaultFilters);
  const accountsById = useMemo(
    () => new Map(dashboard.accounts.map((account) => [account.id, account])),
    [dashboard.accounts]
  );
  const filteredCashAccounts = useMemo(
    () => dashboard.cashAccounts.filter((account) => accountMatchesFilters(account, filters)),
    [dashboard.cashAccounts, filters]
  );
  const filteredCreditAccounts = useMemo(
    () => dashboard.creditAccounts.filter((account) => accountMatchesFilters(account, filters)),
    [dashboard.creditAccounts, filters]
  );
  const filteredCashAccountIds = new Set(filteredCashAccounts.map((account) => account.id));
  const filteredCreditAccountIds = new Set(filteredCreditAccounts.map((account) => account.id));
  const accountFilteredCashTransactions = dashboard.cashTransactions.filter((transaction) =>
    filteredCashAccountIds.has(transaction.accountId)
  );
  const accountFilteredCreditCardExpenses = dashboard.creditCardExpenses.filter((transaction) =>
    filteredCreditAccountIds.has(transaction.accountId)
  );
  const cashTransactions = filterTransactionsByTimeline(
    accountFilteredCashTransactions,
    filters.timeline
  );
  const creditCardExpenses = filterTransactionsByTimeline(
    accountFilteredCreditCardExpenses,
    filters.timeline
  );
  const interestRates = getCurrentInterestRates(cashTransactions, filteredCashAccounts);

  const transactionColumns: TableColumn<CashTransactionDto>[] = [
    {
      key: "date",
      header: "Date",
      value: (transaction) => transaction.tradeDate,
      render: (transaction) => formatDate(transaction.tradeDate),
    },
    {
      key: "account",
      header: "Account",
      value: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
      render: (transaction) => accountsById.get(transaction.accountId)?.name ?? "Unknown",
    },
    {
      key: "action",
      header: "Action",
      value: (transaction) => transaction.action ?? transaction.type,
      render: (transaction) => transaction.action ?? transaction.type,
    },
    {
      key: "description",
      header: "Description",
      value: (transaction) => transaction.description ?? "-",
      render: (transaction) => (
        <span className="line-clamp-1 text-zinc-600">{transaction.description ?? "-"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      value: (transaction) => transaction.amount.amount,
      render: (transaction) => (
        <span
          className={`font-medium ${
            isOutflowTransaction(transaction) ? "text-negative" : "text-foreground"
          }`}
        >
          {formatMoney(transaction.amount)}
        </span>
      ),
    },
  ];

  return (
    <main className="app-main">
      <div className="app-page">
        <section className="app-panel p-4">
          <CashFilterBar accounts={dashboard.accounts} value={filters} onChange={setFilters} />
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <StatCard
            label="Total cash"
            icon={faMoneyBillWave}
            value={<MetricValueList rows={formatMoneyRows(filteredCashAccounts.map((account) => account.balance))} />}
            align="center"
          />
          <StatCard
            label="Current interest rate"
            value={<MetricValueList rows={formatInterestRows(interestRates)} />}
            align="center"
          />
          <StatCard
            label="Credit card expenses"
            icon={faCreditCard}
            value={<MetricValueList rows={formatMoneyRows(creditCardExpenses.map((transaction) => ({
              amount: Math.abs(transaction.amount.amount),
              currency: transaction.amount.currency,
            })))} />}
            tone="negative"
            align="center"
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Cash transactions"
            rows={cashTransactions}
            columns={transactionColumns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No cash transactions match this view."
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Credit card expenses"
            rows={creditCardExpenses}
            columns={transactionColumns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No credit card expenses match this view."
          />
        </section>
      </div>
    </main>
  );
}
