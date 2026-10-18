"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCreditCard,
  faMoneyBillWave,
} from "@fortawesome/free-solid-svg-icons";
import { DataTable, type TableColumn } from "../components/dashboard/dataTable";
import { MetricValueList } from "../components/dashboard/metricValueList";
import { StatCard } from "../components/dashboard/statCard";
import {
  formatDate,
  formatMoney,
  formatNumber,
  formatPercent,
  signedValueClassName,
} from "../lib/formatters";
import {
  filterTransactionsByTimeline,
  type TimelineRange,
} from "../services/filter_timeline";
import type {
  CalculatedCreditCardBalanceDto,
  CashAccountDto,
  CashDashboardDto,
  CashTransactionDto,
  MoneyDto,
} from "../lib/portfolioTypes";
import { useSessionState } from "../state/sessionState";
import { negativeCashClassName } from "../services/cashPresentation";
import { FilterBar } from "../components/dashboard/filterBar";

type CashPageProps = {
  dashboard: CashDashboardDto;
};

type CashBalanceRow = {
  id: string;
  accountId: string;
  accountName: string;
  institutionName: string;
  category: "cash" | "credit";
  status: string;
  balance: MoneyDto;
  balanceStatus: "available" | "owing" | "credit" | "paid";
  lastSyncedAt: string | null;
};

type CashFilterState = {
  brokerages: string[];
  accountIds: string[];
  accountTypes: string[];
  subTypes: string[];
  registered: string[];
  timeline: TimelineRange;
};

const defaultFilters: CashFilterState = {
  brokerages: [],
  accountIds: [],
  accountTypes: [],
  subTypes: [],
  registered: [],
  timeline: "ALL",
};

function accountBrokerage(account: CashAccountDto): string {
  return account.institutionName ?? "Unknown";
}

function accountType(account: CashAccountDto): string {
  return account.subType ?? (account.category === "credit" ? "Credit card" : "Cash");
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
      filters.accountTypes.includes(accountType(account))) &&
    (filters.subTypes.length === 0 || filters.subTypes.includes(account.subType ?? accountType(account))) &&
    (filters.registered.length === 0 || filters.registered.includes(account.isRegistered ? "Registered" : "Non-registered"))
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

function isClosedAccountStatus(status: string): boolean {
  return ["CLOSED", "INACTIVE", "DEACTIVATED"].includes(status.trim().toUpperCase());
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INTEREST_WINDOW_DAYS = 30;

function signedCashFlow(transaction: CashTransactionDto): number {
  const label = `${transaction.action ?? ""} ${transaction.type}`.toUpperCase();
  const amount = Math.abs(transaction.amount.amount);
  const inflowActions = [
    "DEPOSIT",
    "CONTRIBUTION",
    "INTEREST",
    "REIMBURSEMENT",
    "REFUND",
    "PROMOTION",
    "REWARD",
    "CASHBACK",
  ];
  const outflowActions = [
    "WITHDRAW",
    "SPEND",
    "PURCHASE",
    "CHARGE",
    "DEBIT",
    "FEE",
    "CREDIT_CARD_PAYMENT",
  ];

  if (inflowActions.some((term) => label.includes(term))) return amount;
  if (outflowActions.some((term) => label.includes(term))) return -amount;
  return transaction.amount.amount;
}

function timeWeightedAverageBalance(
  endingBalance: number,
  transactions: CashTransactionDto[],
  windowStart: number,
  windowEnd: number
): number {
  const rows = transactions
    .filter((transaction) => {
      const tradeTime = new Date(transaction.tradeDate).getTime();
      return tradeTime >= windowStart && tradeTime <= windowEnd;
    })
    .sort(
      (a, b) =>
        new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
    );
  let balance = endingBalance;
  let cursor = windowEnd;
  let weightedBalanceMs = 0;

  for (const transaction of rows) {
    const tradeTime = new Date(transaction.tradeDate).getTime();
    weightedBalanceMs += balance * (cursor - tradeTime);
    balance -= signedCashFlow(transaction);
    cursor = tradeTime;
  }

  weightedBalanceMs += balance * (cursor - windowStart);
  return weightedBalanceMs / (windowEnd - windowStart);
}

function getCurrentInterestRates(
  transactions: CashTransactionDto[],
  cashAccounts: CashAccountDto[]
): Array<{ currency: string; percent: number | null }> {
  const currencyMetrics = new Map<
    string,
    { interest: number; averageBalance: number }
  >();

  for (const account of cashAccounts) {
    if (
      ["CLOSED", "INACTIVE", "DEACTIVATED"].includes(
        (account.status ?? "").toUpperCase()
      )
    ) {
      continue;
    }

    const accountTransactions = transactions.filter(
      (transaction) => transaction.accountId === account.id
    );
    const latestTransactionTime = Math.max(
      0,
      ...accountTransactions.map((transaction) =>
        new Date(transaction.tradeDate).getTime()
      )
    );
    const syncedTime = account.lastSyncedAt
      ? new Date(account.lastSyncedAt).getTime()
      : 0;
    const snapshotTime = syncedTime || latestTransactionTime;

    for (const balance of account.balances) {
      const current = currencyMetrics.get(balance.currency) ?? {
        interest: 0,
        averageBalance: 0,
      };
      const currencyTransactions = accountTransactions.filter(
        (transaction) => transaction.amount.currency === balance.currency
      );
      const latestInterestTransaction = currencyTransactions
        .filter(
          (transaction) =>
            isInterestTransaction(transaction) &&
            new Date(transaction.tradeDate).getTime() <= snapshotTime
        )
        .sort(
          (a, b) =>
            new Date(b.tradeDate).getTime() -
            new Date(a.tradeDate).getTime()
        )[0];

      if (!latestInterestTransaction || snapshotTime === 0) {
        currencyMetrics.set(balance.currency, {
          interest: current.interest,
          averageBalance: current.averageBalance,
        });
        continue;
      }

      const windowEnd = new Date(
        latestInterestTransaction.tradeDate
      ).getTime();
      const windowStart = windowEnd - INTEREST_WINDOW_DAYS * DAY_MS;
      const balanceAtWindowEnd =
        balance.amount -
        currencyTransactions
          .filter((transaction) => {
            const tradeTime = new Date(transaction.tradeDate).getTime();
            return tradeTime > windowEnd && tradeTime <= snapshotTime;
          })
          .reduce(
            (total, transaction) => total + signedCashFlow(transaction),
            0
          );
      const interest = Math.abs(
        latestInterestTransaction.amount.amount
      );
      const averageBalance = timeWeightedAverageBalance(
        balanceAtWindowEnd,
        currencyTransactions,
        windowStart,
        windowEnd
      );

      currencyMetrics.set(balance.currency, {
        interest: current.interest + interest,
        averageBalance: current.averageBalance + averageBalance,
      });
    }
  }

  return Array.from(currencyMetrics.entries())
    .map(([currency, metrics]) => ({
      currency,
      percent:
        metrics.averageBalance > 0 && metrics.interest > 0
          ? (metrics.interest / metrics.averageBalance) *
            (365 / INTEREST_WINDOW_DAYS) *
            100
          : null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function formatMoneyRows(values: MoneyDto[]) {
  return groupMoney(values).map((value) => ({
    id: value.currency,
    value: formatNumber(value.amount),
    suffix: value.currency,
    className: negativeCashClassName(value.amount),
  }));
}

function formatCreditBalanceRows(values: CalculatedCreditCardBalanceDto[]) {
  return groupMoney(
    values.map((value) => ({
      amount: value.netAmount,
      currency: value.currency,
    }))
  ).map((value) => {
    const status =
      value.amount > 0 ? "credit" : value.amount < 0 ? "owing" : "paid";
    return {
      id: value.currency,
      value: formatNumber(value.amount),
      suffix: `${value.currency} ${status}`,
      className:
        value.amount > 0
          ? "text-positive"
          : value.amount < 0
            ? "text-negative"
            : "text-foreground",
    };
  });
}

function transactionDisplayAmount(
  transaction: CashTransactionDto,
  account: CashAccountDto | undefined
): number {
  const action = `${transaction.action ?? ""} ${transaction.type}`.toUpperCase();
  const amount = Math.abs(transaction.amount.amount);

  if (action.includes("CREDIT_CARD_PAYMENT_RECEIVED")) return amount;
  if (action.includes("CREDIT_CARD_PAYMENT_SENT")) return -amount;
  if (action.includes("CREDIT_CARD_PAYMENT")) {
    return account?.category === "credit" ? amount : -amount;
  }
  if (
    ["REIMBURSEMENT", "REFUND", "REVERSAL", "INTEREST", "CASHBACK"].some(
      (term) => action.includes(term)
    )
  ) {
    return amount;
  }
  if (
    ["SPEND", "PURCHASE", "CHARGE", "DEBIT", "FEE"].some((term) =>
      action.includes(term)
    )
  ) {
    return -amount;
  }

  return transaction.amount.amount;
}

function formatInterestRows(values: Array<{ currency: string; percent: number | null }>) {
  return values.map((value) => ({
    id: value.currency,
    value: value.percent == null ? "-" : formatPercent(value.percent),
    suffix: value.currency,
  }));
}

export function CashPage({ dashboard }: CashPageProps) {
  const [filters, setFilters] = useSessionState("cash:filters", defaultFilters);
  const [showClosedBalances, setShowClosedBalances] = useSessionState(
    "cash:show-closed-balances",
    false
  );
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
    filteredCashAccountIds.has(transaction.accountId) ||
    filteredCreditAccountIds.has(transaction.accountId)
  );
  const accountFilteredExpenses = dashboard.expenses.filter(
    (transaction) =>
      filteredCashAccountIds.has(transaction.accountId) ||
      filteredCreditAccountIds.has(transaction.accountId)
  );
  const cashTransactions = filterTransactionsByTimeline(
    accountFilteredCashTransactions,
    filters.timeline
  );
  const expenses = filterTransactionsByTimeline(
    accountFilteredExpenses,
    filters.timeline
  );
  const interestRates = getCurrentInterestRates(
    accountFilteredCashTransactions,
    filteredCashAccounts
  );
  const filteredCreditCardBalances = dashboard.creditCardBalances.filter(
    (balance) => filteredCreditAccountIds.has(balance.accountId)
  );
  const balanceRows: CashBalanceRow[] = [
    ...filteredCashAccounts.flatMap((account) =>
    account.balances.map((balance) => ({
      id: `${account.id}:${balance.currency}`,
      accountId: account.id,
      accountName: account.name,
      institutionName: account.institutionName ?? "Unknown",
      category: account.category,
      status: account.status ?? "Unknown",
      balance,
      balanceStatus: "available" as const,
      lastSyncedAt: account.lastSyncedAt,
    }))
    ),
    ...filteredCreditCardBalances.map((balance) => {
      const account = accountsById.get(balance.accountId);

      return {
        id: `${balance.accountId}:${balance.currency}`,
        accountId: balance.accountId,
        accountName: account?.name ?? "Credit card",
        institutionName: account?.institutionName ?? "Unknown",
        category: "credit" as const,
        status: account?.status ?? "Unknown",
        balance: {
          amount: balance.netAmount,
          currency: balance.currency,
        },
        balanceStatus: balance.status,
        lastSyncedAt: balance.calculatedThrough ?? account?.lastSyncedAt ?? null,
      };
    }),
  ];
  const visibleBalanceRows = showClosedBalances
    ? balanceRows
    : balanceRows.filter((row) => !isClosedAccountStatus(row.status));

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
      render: (transaction) => {
        const amount = transactionDisplayAmount(
          transaction,
          accountsById.get(transaction.accountId)
        );
        return (
          <span className={negativeCashClassName(amount, "text-foreground")}>
            {transaction.action ?? transaction.type}
          </span>
        );
      },
    },
    {
      key: "description",
      header: "Description",
      value: (transaction) => transaction.description ?? "-",
      render: (transaction) => (
        <span className="line-clamp-1 text-content-secondary">{transaction.description ?? "-"}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      value: (transaction) =>
        transactionDisplayAmount(transaction, accountsById.get(transaction.accountId)),
      render: (transaction) => {
        const amount = transactionDisplayAmount(
          transaction,
          accountsById.get(transaction.accountId)
        );
        return (
          <span className={`font-medium ${signedValueClassName(amount)}`}>
            {formatMoney({ ...transaction.amount, amount })}
          </span>
        );
      },
    },
  ];
  const balanceColumns: TableColumn<CashBalanceRow>[] = [
    {
      key: "account",
      header: "Account",
      value: (row) => row.accountName,
      render: (row) => row.accountName,
    },
    {
      key: "institution",
      header: "Institution",
      value: (row) => row.institutionName,
      render: (row) => row.institutionName,
    },
    {
      key: "category",
      header: "Account category",
      value: (row) => (row.category === "credit" ? "Credit card" : "Debit / cash"),
      render: (row) => (row.category === "credit" ? "Credit card" : "Debit / cash"),
    },
    {
      key: "status",
      header: "Account status",
      value: (row) => row.status,
      render: (row) => row.status,
    },
    {
      key: "balanceStatus",
      header: "Balance status",
      value: (row) =>
        row.balanceStatus === "credit"
          ? "In credit"
          : row.balanceStatus === "owing"
            ? "Owing"
            : row.balanceStatus === "paid"
              ? "Paid"
              : "Available",
      render: (row) =>
        row.balanceStatus === "credit"
          ? "In credit"
          : row.balanceStatus === "owing"
            ? "Owing"
            : row.balanceStatus === "paid"
              ? "Paid"
              : "Available",
    },
    {
      key: "synced",
      header: "Balance as of",
      value: (row) => row.lastSyncedAt ?? "",
      render: (row) => (row.lastSyncedAt ? formatDate(row.lastSyncedAt) : "-"),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      value: (row) => row.balance.amount,
      render: (row) => (
        <span className={`font-medium ${signedValueClassName(row.balance.amount)}`}>
          {formatMoney(row.balance)}
        </span>
      ),
    },
  ];

  return (
    <main className="app-main">
      <div className="app-page">
        <section className="app-panel p-4">
          <FilterBar
            accounts={dashboard.accounts.map((account) => ({
              ...account,
              subType: account.subType ?? (account.category === "credit" ? "Credit card" : "Cash"),
            }))}
            value={filters}
            onChange={setFilters}
            show={{ accountType: false }}
          />
        </section>

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total cash"
            icon={faMoneyBillWave}
            value={
              <MetricValueList
                rows={formatMoneyRows(
                  filteredCashAccounts.flatMap((account) => account.balances)
                )}
              />
            }
            align="center"
          />
          <StatCard
            label="Credit card owing balance"
            icon={faCreditCard}
            value={
              <MetricValueList
                rows={formatCreditBalanceRows(filteredCreditCardBalances)}
              />
            }
            align="center"
          />
          <StatCard
            label="Credit limit"
            icon={faCreditCard}
            value={
              <MetricValueList
                rows={formatMoneyRows(
                  filteredCreditAccounts.flatMap((account) =>
                    account.creditLimit ? [account.creditLimit] : []
                  )
                )}
              />
            }
            align="center"
          />
          <StatCard
            label="Current interest rate (30 days)"
            value={<MetricValueList rows={formatInterestRows(interestRates)} />}
            align="center"
          />
          <StatCard
            label="Total expenses"
            value={
              <MetricValueList
                rows={formatMoneyRows(
                  expenses.map((transaction) => ({
                    amount: Math.abs(transaction.amount.amount),
                    currency: transaction.amount.currency,
                  }))
                )}
              />
            }
            tone="negative"
            align="center"
          />
        </section>

        {dashboard.unallocatedCreditCardPayments.length > 0 ? (
          <section className="app-panel mt-6 border-warning-border bg-warning-surface p-4 text-sm text-warning-text-strong">
            Some credit-card payments could not be assigned because more than
            one card shares the same institution and currency. Unallocated:{" "}
            {dashboard.unallocatedCreditCardPayments
              .map((payment) => formatMoney(payment))
              .join(", ")}.
          </section>
        ) : null}

        <section className="mt-6">
          <DataTable
            title="Account Balances"
            stateKey="cash:account-balances"
            titleAccessory={
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={showClosedBalances}
                  onChange={(event) => setShowClosedBalances(event.target.checked)}
                  className="h-4 w-4 rounded border-border text-action focus:ring-focus"
                />
                Show closed
              </label>
            }
            rows={visibleBalanceRows}
            columns={balanceColumns}
            getRowKey={(row) => row.id}
            emptyMessage="No account balances match this view."
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Cash transactions"
            stateKey="cash:transactions"
            rows={cashTransactions}
            columns={transactionColumns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No cash transactions match this view."
          />
        </section>

        <section className="mt-6">
          <DataTable
            title="Total Expenses"
            stateKey="cash:expenses"
            rows={expenses}
            columns={transactionColumns}
            getRowKey={(transaction) => transaction.id}
            emptyMessage="No expenses match this view."
          />
        </section>
      </div>
    </main>
  );
}
