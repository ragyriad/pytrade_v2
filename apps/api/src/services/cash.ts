import {
  accounts,
  and,
  db,
  desc,
  eq,
  inArray,
  transactions,
  users,
  type Account,
  type Transaction,
} from "@repo/db";
import type { MoneyBreakdownDto, MoneyDto } from "../shared/money.js";

export type CashAccountDto = {
  id: string;
  name: string;
  institutionName: string | null;
  accountCurrency: string | null;
  type: string | null;
  status: string | null;
  category: "cash" | "credit";
  balance: MoneyDto;
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
  creditCardExpenses: CashTransactionDto[];
  totalCash: MoneyBreakdownDto[];
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

function normalizedText(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ").trim().toUpperCase();
}

function isCashAccount(account: Account): boolean {
  const value = normalizedText(
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType,
    account.name
  );

  return value.includes("MSB") || value.includes("CASH");
}

function isCreditAccount(account: Account): boolean {
  const value = normalizedText(
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType,
    account.name,
    account.brokerageName
  );

  return value.includes("CREDIT") || value.includes("CARD");
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

function toCashAccountDto(account: Account): CashAccountDto {
  const category = isCreditAccount(account) ? "credit" : "cash";

  return {
    id: account.id,
    name: account.name ?? account.brokerageAccountNumber ?? "Account",
    institutionName: account.brokerageName,
    accountCurrency: account.accountCurrency,
    type: account.type,
    status: account.status,
    category,
    balance: {
      amount: toNumber(account.balanceAmount),
      currency: account.balanceCurrency ?? account.accountCurrency ?? "USD",
    },
    lastSyncedAt: toIso(account.lastHoldingsSyncAt ?? account.lastTransactionsSyncAt),
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

function isCreditCardExpense(transaction: CashTransactionDto): boolean {
  const action = normalizedText(transaction.action, transaction.type);
  const excluded =
    action.includes("PAYMENT") ||
    action.includes("TRANSFER") ||
    action.includes("DEPOSIT") ||
    action.includes("CONTRIBUTION") ||
    action.includes("REIMBURSEMENT") ||
    action.includes("INTEREST");

  return !transaction.isArchived && !excluded && Math.abs(transaction.amount.amount) > 0;
}

function creditCardExpenseDedupeKey(transaction: CashTransactionDto): string {
  return [
    transaction.accountId,
    new Date(transaction.tradeDate).toISOString(),
    transaction.amount.currency,
    transaction.amount.amount.toFixed(2),
    transaction.action ?? transaction.type,
    transaction.description ?? "",
  ].join("|");
}

function dedupeCreditCardExpenses(
  transactions: CashTransactionDto[]
): CashTransactionDto[] {
  const rowsByKey = new Map<string, CashTransactionDto>();

  for (const transaction of transactions) {
    const key = creditCardExpenseDedupeKey(transaction);
    const existing = rowsByKey.get(key);

    if (!existing || transaction.id.localeCompare(existing.id) < 0) {
      rowsByKey.set(key, transaction);
    }
  }

  return Array.from(rowsByKey.values()).sort(
    (a, b) => new Date(b.tradeDate).getTime() - new Date(a.tradeDate).getTime()
  );
}

function getCurrentInterestRates(
  cashTransactions: CashTransactionDto[],
  cashAccounts: CashAccountDto[]
): Array<{ currency: string; percent: number | null }> {
  const balances = groupMoney(cashAccounts.map((account) => account.balance));
  const latestTransactionTime = Math.max(
    0,
    ...cashTransactions.map((transaction) => new Date(transaction.tradeDate).getTime())
  );

  if (latestTransactionTime === 0) {
    return balances.map((balance) => ({ currency: balance.currency, percent: null }));
  }

  const latest = new Date(latestTransactionTime);
  const windowStart = new Date(latest);
  windowStart.setDate(windowStart.getDate() - 30);
  const interestByCurrency = groupMoney(
    cashTransactions
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

async function resolveUserId(requestedUserId?: string) {
  if (requestedUserId) {
    const rows = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
    if (rows[0]) return rows[0];
  }

  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
}

export async function getCashDashboard(
  requestedUserId?: string
): Promise<CashDashboardDto | null> {
  const user = await resolveUserId(requestedUserId);
  if (!user) return null;

  const accountRows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, user.id), eq(accounts.isArchived, false)));
  const scopedAccountRows = accountRows.filter(
    (account) => isCashAccount(account) || isCreditAccount(account)
  );
  const accountIds = scopedAccountRows.map((account) => account.id);
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

  const accountDtos = scopedAccountRows.map(toCashAccountDto);
  const cashAccounts = accountDtos.filter((account) => account.category === "cash");
  const creditAccounts = accountDtos.filter((account) => account.category === "credit");
  const transactionDtos = transactionRows.map(toCashTransactionDto);
  const cashAccountIds = new Set(cashAccounts.map((account) => account.id));
  const creditAccountIds = new Set(creditAccounts.map((account) => account.id));
  const cashAccountTransactions = transactionDtos.filter(
    (transaction) => cashAccountIds.has(transaction.accountId) && !transaction.isArchived
  );
  const cashTransactions = transactionDtos.filter(
    (transaction) => isCashTransaction(transaction) && !transaction.isArchived
  );
  const creditCardExpenses = dedupeCreditCardExpenses(
    transactionDtos.filter(
      (transaction) =>
        creditAccountIds.has(transaction.accountId) && isCreditCardExpense(transaction)
    )
  );

  return {
    accounts: accountDtos,
    cashAccounts,
    creditAccounts,
    cashTransactions,
    creditCardExpenses,
    totalCash: groupMoney(cashAccounts.map((account) => account.balance)),
    currentInterestRates: getCurrentInterestRates(
      cashAccountTransactions,
      cashAccounts
    ),
  };
}
