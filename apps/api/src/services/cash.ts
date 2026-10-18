import {
  accountBalances,
  accounts,
  and,
  db,
  desc,
  eq,
  inArray,
  transactions,
  type Account,
  type AccountBalance,
  type Transaction,
} from "@repo/db";
import type { MoneyBreakdownDto, MoneyDto } from "../shared/money.js";
import {
  calculateCreditCardBalances,
  type CalculatedCreditCardBalance,
} from "./credit-card-balances.js";
import { isCashPageAccount } from "./account_scope.js";

export type CashAccountDto = {
  id: string;
  name: string;
  institutionName: string | null;
  accountCurrency: string | null;
  type: Account["type"];
  subType: string | null;
  management: string | null;
  isRegistered: boolean;
  status: string | null;
  category: "cash" | "credit";
  balance: MoneyDto;
  balances: MoneyDto[];
  creditLimit: MoneyDto | null;
  lastSyncedAt: string | null;
};

export type CashTransactionDto = {
  id: string;
  accountId: string;
  source: string;
  type: string;
  action: string | null;
  assetType: string | null;
  description: string | null;
  amount: MoneyDto;
  fee: MoneyDto;
  symbol: string | null;
  tradeDate: string;
  isArchived: boolean;
};

export type CashDashboardDto = {
  accounts: CashAccountDto[];
  cashAccounts: CashAccountDto[];
  creditAccounts: CashAccountDto[];
  cashTransactions: CashTransactionDto[];
  expenses: CashTransactionDto[];
  debitAccountExpenses: CashTransactionDto[];
  creditCardExpenses: CashTransactionDto[];
  creditCardBalances: CalculatedCreditCardBalance[];
  unallocatedCreditCardPayments: MoneyBreakdownDto[];
  totalCash: MoneyBreakdownDto[];
  totalCreditBalance: MoneyBreakdownDto[];
  currentInterestRates: Array<{
    currency: string;
    percent: number | null;
  }>;
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function latestIso(
  ...values: Array<Date | string | null | undefined>
): string | null {
  const timestamps = values
    .map((value) => (value ? new Date(value).getTime() : Number.NaN))
    .filter(Number.isFinite);

  return timestamps.length > 0
    ? new Date(Math.max(...timestamps)).toISOString()
    : null;
}

function normalizedText(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ").trim().toUpperCase();
}

function isCashAccount(account: Account): boolean {
  return isCashPageAccount(account) && account.type === "Cash";
}

function isCreditAccount(account: Account): boolean {
  return isCashPageAccount(account) && account.type === "Card";
}

function groupMoney(values: MoneyDto[]): MoneyBreakdownDto[] {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency));
}

function stringFromRawData(
  rawData: Record<string, unknown> | null,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = rawData?.[key];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function isGenericCreditCardDescription(value: string | null | undefined): boolean {
  const normalized = value?.trim().toUpperCase();
  return normalized === "CREDIT_CARD" || normalized === "CREDIT CARD";
}

function getTransactionDescription(transaction: Transaction): string | null {
  const rawData = transaction.rawData;
  const rawDescription = stringFromRawData(
    rawData,
    "merchant",
    "merchant_name",
    "merchantName",
    "payee",
    "name",
    "original_description",
    "originalDescription",
    "description"
  );
  const description = transaction.description ?? rawDescription;

  if (isGenericCreditCardDescription(description)) return null;
  return description ?? null;
}

function toCashAccountDto(
  account: Account,
  accountBalanceRows: AccountBalance[]
): CashAccountDto {
  const category = isCreditAccount(account) ? "credit" : "cash";
  const balances =
    accountBalanceRows.length > 0
      ? accountBalanceRows.map((balance) => ({
          amount: toNumber(balance.cash ?? balance.buyingPower),
          currency: balance.currencyCode,
        }))
      : [
          {
            amount: toNumber(account.balanceAmount),
            currency: account.balanceCurrency ?? account.accountCurrency ?? "USD",
          },
        ];
  const primaryBalance =
    balances.find(
      (balance) =>
        balance.currency === (account.balanceCurrency ?? account.accountCurrency)
    ) ?? balances[0];
  const creditLimit =
    category === "credit" &&
    normalizedText(account.brokerageName).includes("WEALTHSIMPLE")
      ? { amount: 10_000, currency: "CAD" }
      : null;

  return {
    id: account.id,
    name: account.name ?? account.brokerageAccountNumber ?? "Account",
    institutionName: account.brokerageName,
    accountCurrency: account.accountCurrency,
    type: account.type,
    subType: account.subType,
    management: account.management,
    isRegistered: account.isRegistered,
    status: account.status,
    category,
    balance: primaryBalance,
    balances,
    creditLimit,
    lastSyncedAt: latestIso(
      account.lastHoldingsSyncAt,
      account.lastTransactionsSyncAt,
      ...accountBalanceRows.map((balance) => balance.syncedAt)
    ),
  };
}

function toCashTransactionDto(transaction: Transaction): CashTransactionDto {
  const currency = transaction.currencyCode ?? "USD";

  return {
    id: transaction.id,
    accountId: transaction.accountId,
    source: transaction.source,
    type: transaction.type,
    action: transaction.action ?? transaction.type,
    assetType: transaction.assetType,
    description: getTransactionDescription(transaction),
    amount: {
      amount: toNumber(transaction.amount),
      currency,
    },
    fee: {
      amount: toNumber(transaction.fee),
      currency,
    },
    symbol: transaction.symbol,
    tradeDate: toIso(transaction.tradeDate) ?? new Date(0).toISOString(),
    isArchived: transaction.isArchived,
  };
}

function isInterestTransaction(transaction: CashTransactionDto): boolean {
  return normalizedText(transaction.action, transaction.type).includes("INTEREST");
}

function isCashTransaction(transaction: CashTransactionDto): boolean {
  return (
    normalizedText(transaction.type) === "CASH" ||
    normalizedText(transaction.assetType) === "CASH"
  );
}

function isExpenseTransaction(transaction: CashTransactionDto): boolean {
  const action = normalizedText(transaction.action, transaction.type);
  const expenseActions = ["SPEND", "PURCHASE", "CHARGE", "DEBIT", "FEE"];

  return (
    !transaction.isArchived &&
    Math.abs(transaction.amount.amount) > 0 &&
    expenseActions.some((term) => action.includes(term))
  );
}

function expenseDedupeKey(transaction: CashTransactionDto): string {
  return [
    transaction.accountId,
    new Date(transaction.tradeDate).toISOString(),
    transaction.amount.currency,
    transaction.amount.amount.toFixed(2),
    transaction.action ?? transaction.type,
    transaction.description ?? "",
  ].join("|");
}

function dedupeExpenses(
  transactions: CashTransactionDto[]
): CashTransactionDto[] {
  const rowsByKey = new Map<string, CashTransactionDto>();

  for (const transaction of transactions) {
    const key = expenseDedupeKey(transaction);
    const existing = rowsByKey.get(key);

    if (!existing || transaction.id.localeCompare(existing.id) < 0) {
      rowsByKey.set(key, transaction);
    }
  }

  return Array.from(rowsByKey.values()).sort(
    (a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;
const INTEREST_WINDOW_DAYS = 30;

function signedCashFlow(transaction: CashTransactionDto): number {
  const action = normalizedText(transaction.action, transaction.type);
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

  if (inflowActions.some((term) => action.includes(term))) return amount;
  if (outflowActions.some((term) => action.includes(term))) return -amount;
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
  cashTransactions: CashTransactionDto[],
  cashAccounts: CashAccountDto[]
): Array<{ currency: string; percent: number | null }> {
  const currencyMetrics = new Map<
    string,
    { interest: number; averageBalance: number }
  >();

  for (const account of cashAccounts) {
    if (
      ["CLOSED", "INACTIVE", "DEACTIVATED"].includes(
        normalizedText(account.status)
      )
    ) {
      continue;
    }

    const accountTransactions = cashTransactions.filter(
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

export async function getCashDashboard(
  requestedUserId: string
): Promise<CashDashboardDto | null> {
  const accountRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, requestedUserId), eq(accounts.isArchived, false)));
  const scopedAccountRows = accountRows.filter(
    (account) => isCashAccount(account) || isCreditAccount(account)
  );
  const accountIds = scopedAccountRows.map((account) => account.id);
  const balanceRows =
    accountIds.length === 0
      ? []
      : await db
          .select()
          .from(accountBalances)
          .where(inArray(accountBalances.accountId, accountIds));
  const transactionRows =
    accountIds.length === 0
      ? []
      : await db
          .select()
          .from(transactions)
          .where(
            and(
              inArray(transactions.accountId, accountIds),
              eq(transactions.isArchived, false)
            )
          )
          .orderBy(desc(transactions.tradeDate));

  const balanceRowsByAccount = new Map<string, AccountBalance[]>();
  for (const balance of balanceRows) {
    const rows = balanceRowsByAccount.get(balance.accountId) ?? [];
    rows.push(balance);
    balanceRowsByAccount.set(balance.accountId, rows);
  }
  const accountDtos = scopedAccountRows.map((account) =>
    toCashAccountDto(account, balanceRowsByAccount.get(account.id) ?? [])
  );
  const cashAccounts = accountDtos.filter((account) => account.category === "cash");
  const creditAccounts = accountDtos.filter((account) => account.category === "credit");
  const rawTransactionDtos = transactionRows.map(toCashTransactionDto);
  const creditCardBalanceCalculation = calculateCreditCardBalances(
    accountDtos,
    rawTransactionDtos
  );
  const sentPaymentTransactionIds = new Set(
    creditCardBalanceCalculation.sentPaymentTransactionIds
  );
  const receivedPaymentTransactionIds = new Set(
    creditCardBalanceCalculation.receivedPaymentTransactionIds
  );
  const transactionDtos = rawTransactionDtos.map((transaction) => ({
    ...transaction,
    action: sentPaymentTransactionIds.has(transaction.id)
      ? "CREDIT_CARD_PAYMENT_SENT"
      : receivedPaymentTransactionIds.has(transaction.id)
        ? "CREDIT_CARD_PAYMENT_RECEIVED"
        : transaction.action,
  }));
  const cashAccountIds = new Set(cashAccounts.map((account) => account.id));
  const creditAccountIds = new Set(creditAccounts.map((account) => account.id));
  const cashAccountTransactions = transactionDtos.filter(
    (transaction) => cashAccountIds.has(transaction.accountId) && !transaction.isArchived
  );
  const cashTransactions = transactionDtos.filter(
    (transaction) => isCashTransaction(transaction) && !transaction.isArchived
  );
  const debitAccountExpenses = dedupeExpenses(
    transactionDtos.filter(
      (transaction) =>
        cashAccountIds.has(transaction.accountId) &&
        isExpenseTransaction(transaction)
    )
  );
  const creditCardExpenses = dedupeExpenses(
    transactionDtos.filter(
      (transaction) =>
        creditAccountIds.has(transaction.accountId) &&
        isExpenseTransaction(transaction)
    )
  );
  const expenses = dedupeExpenses([
    ...debitAccountExpenses,
    ...creditCardExpenses,
  ]);
  return {
    accounts: accountDtos,
    cashAccounts,
    creditAccounts,
    cashTransactions,
    expenses,
    debitAccountExpenses,
    creditCardExpenses,
    creditCardBalances: creditCardBalanceCalculation.balances,
    unallocatedCreditCardPayments:
      creditCardBalanceCalculation.unallocatedPayments,
    totalCash: groupMoney(cashAccounts.flatMap((account) => account.balances)),
    totalCreditBalance: groupMoney(
      creditCardBalanceCalculation.balances.map((balance) => ({
        amount: balance.netAmount,
        currency: balance.currency,
      }))
    ),
    currentInterestRates: getCurrentInterestRates(
      cashAccountTransactions,
      cashAccounts
    ),
  };
}
