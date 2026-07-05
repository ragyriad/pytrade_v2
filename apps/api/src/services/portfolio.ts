import {
  accounts,
  db,
  desc,
  eq,
  inArray,
  positions,
  transactions,
  users,
  type Account,
  type Position,
  type Transaction,
} from "@repo/db";
import type { MoneyBreakdownDto, MoneyDto } from "../shared/money.js";

export type AccountDto = {
  id: string;
  brokerageAccountNumber: string | null;
  linkedAccountId: string | null;
  name: string;
  institutionName: string | null;
  accountCurrency: string | null;
  type: string | null;
  status: string | null;
  balance: MoneyDto;
  lastSyncedAt: string | null;
};

export type PositionDto = {
  id: string;
  accountId: string;
  securityId: string | null;
  symbol: string;
  description: string | null;
  units: number;
  price: MoneyDto | null;
  marketValue: MoneyDto;
  averagePurchasePrice: MoneyDto | null;
  unrealizedGainLoss: MoneyDto | null;
  assetType: string | null;
  logoUrl: string | null;
  isCashEquivalent: boolean;
};

export type TransactionDto = {
  id: string;
  accountId: string;
  securityId: string | null;
  underlyingSecurityId: string | null;
  optionId: string | null;
  source: string;
  type: string;
  action: string | null;
  optionAction: string | null;
  assetType: string | null;
  description: string | null;
  amount: MoneyDto;
  fee: MoneyDto;
  price: MoneyDto | null;
  units: number | null;
  symbol: string | null;
  tradeDate: string;
  isArchived: boolean;
};

export type AllocationDto = {
  label: string;
  value: number;
  percentage: number;
};

export type DividendGroupDto = {
  id: string;
  label: string;
  brokerageName: string | null;
  accountType: string | null;
  totalByCurrency: MoneyBreakdownDto[];
  transactionCount: number;
};

export type DividendSummaryDto = {
  totalByCurrency: MoneyBreakdownDto[];
  byAccount: DividendGroupDto[];
  byBrokerage: DividendGroupDto[];
  transactions: TransactionDto[];
};

export type FeeSummaryDto = {
  totalByCurrency: MoneyBreakdownDto[];
  transactions: TransactionDto[];
};

export type PortfolioSummaryDto = {
  user: {
    id: string;
    username: string;
  };
  totalValue: MoneyDto;
  totalValueByCurrency: MoneyBreakdownDto[];
  totalUnrealizedGainLoss: MoneyDto;
  totalUnrealizedGainLossByCurrency: MoneyBreakdownDto[];
  accountCount: number;
  positionCount: number;
  transactionCount: number;
  lastSyncedAt: string | null;
};

export type PortfolioDashboardDto = {
  summary: PortfolioSummaryDto;
  accounts: AccountDto[];
  positions: PositionDto[];
  transactions: TransactionDto[];
  recentTransactions: TransactionDto[];
  allocationByAssetType: AllocationDto[];
  allocationByAccount: AllocationDto[];
  dividends: DividendSummaryDto;
  fees: FeeSummaryDto;
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

function currencyForPosition(position: Position): string {
  return position.currencyCode ?? "USD";
}

function marketValueForPosition(position: Position): number {
  return toNumber(position.units) * toNumber(position.price);
}

function toAccountDto(account: Account): AccountDto {
  return {
    id: account.id,
    brokerageAccountNumber: account.brokerageAccountNumber,
    linkedAccountId: account.linkedAccountId,
    name: account.name ?? account.brokerageAccountNumber ?? "Account",
    institutionName: account.brokerageName,
    accountCurrency: account.accountCurrency,
    type: account.type,
    status: account.status,
    balance: {
      amount: toNumber(account.balanceAmount),
      currency: account.balanceCurrency ?? account.accountCurrency ?? "USD",
    },
    lastSyncedAt: toIso(account.lastHoldingsSyncAt ?? account.lastTransactionsSyncAt),
  };
}

function toPositionDto(position: Position): PositionDto {
  const currency = currencyForPosition(position);

  return {
    id: position.id,
    accountId: position.accountId,
    securityId: position.securityId,
    symbol: position.symbol,
    description: position.description,
    units: toNumber(position.units),
    price:
      position.price == null
        ? null
        : {
            amount: toNumber(position.price),
            currency,
          },
    marketValue: {
      amount: marketValueForPosition(position),
      currency,
    },
    averagePurchasePrice:
      position.averagePurchasePrice == null
        ? null
        : {
            amount: toNumber(position.averagePurchasePrice),
            currency,
          },
    unrealizedGainLoss:
      position.openPnl == null
        ? null
        : {
            amount: toNumber(position.openPnl),
            currency,
          },
    assetType: position.instrumentTypeDescription ?? position.instrumentTypeCode,
    logoUrl: position.logoUrl,
    isCashEquivalent: position.cashEquivalent ?? false,
  };
}

function toTransactionDto(transaction: Transaction): TransactionDto {
  const currency = transaction.currencyCode ?? "USD";

  return {
    id: transaction.id,
    accountId: transaction.accountId,
    securityId: transaction.securityId,
    underlyingSecurityId: transaction.underlyingSecurityId,
    optionId: transaction.optionId,
    source: transaction.source,
    type: transaction.type,
    action: transaction.action ?? transaction.type,
    optionAction: transaction.optionAction,
    assetType: transaction.assetType,
    description: transaction.description,
    amount: {
      amount: toNumber(transaction.amount),
      currency,
    },
    fee: {
      amount: toNumber(transaction.fee),
      currency,
    },
    price:
      transaction.price == null
        ? null
        : {
            amount: toNumber(transaction.price),
            currency,
          },
    units: transaction.units == null ? null : toNumber(transaction.units),
    symbol: transaction.symbol,
    tradeDate: toIso(transaction.tradeDate) ?? new Date(0).toISOString(),
    isArchived: transaction.isArchived,
  };
}

function buildAllocation(
  positions: PositionDto[],
  getLabel: (position: PositionDto) => string
): AllocationDto[] {
  const totals = new Map<string, number>();

  for (const position of positions) {
    const label = getLabel(position);
    totals.set(label, (totals.get(label) ?? 0) + position.marketValue.amount);
  }

  const totalValue = [...totals.values()].reduce((sum, value) => sum + value, 0);

  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      value,
      percentage: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function groupMoney(values: MoneyDto[]): MoneyBreakdownDto[] {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return [...totals.entries()]
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => b.amount - a.amount);
}

function isDividendTransaction(transaction: TransactionDto): boolean {
  return (transaction.action ?? transaction.type).toUpperCase().includes("DIVIDEND");
}

function buildDividendSummary(
  dividendTransactions: TransactionDto[],
  accountDtos: AccountDto[]
): DividendSummaryDto {
  const accountsById = new Map(accountDtos.map((account) => [account.id, account]));
  const byAccount = new Map<string, TransactionDto[]>();
  const byBrokerage = new Map<string, TransactionDto[]>();

  for (const transaction of dividendTransactions) {
    const account = accountsById.get(transaction.accountId);
    const brokerageName = account?.institutionName ?? "Unknown";

    byAccount.set(transaction.accountId, [
      ...(byAccount.get(transaction.accountId) ?? []),
      transaction,
    ]);
    byBrokerage.set(brokerageName, [
      ...(byBrokerage.get(brokerageName) ?? []),
      transaction,
    ]);
  }

  const toMoney = (transaction: TransactionDto): MoneyDto => ({
    amount: Math.abs(transaction.amount.amount),
    currency: transaction.amount.currency,
  });

  return {
    totalByCurrency: groupMoney(dividendTransactions.map(toMoney)),
    byAccount: [...byAccount.entries()].map(([accountId, rows]) => {
      const account = accountsById.get(accountId);

      return {
        id: accountId,
        label: account?.name ?? "Unknown account",
        brokerageName: account?.institutionName ?? null,
        accountType: account?.type ?? null,
        totalByCurrency: groupMoney(rows.map(toMoney)),
        transactionCount: rows.length,
      };
    }),
    byBrokerage: [...byBrokerage.entries()].map(([brokerageName, rows]) => ({
      id: brokerageName,
      label: brokerageName,
      brokerageName,
      accountType: null,
      totalByCurrency: groupMoney(rows.map(toMoney)),
      transactionCount: rows.length,
    })),
    transactions: dividendTransactions,
  };
}

function buildFeeSummary(transactions: TransactionDto[]): FeeSummaryDto {
  const feeTransactions = transactions.filter(
    (transaction) => Math.abs(transaction.fee.amount) > 0
  );

  return {
    totalByCurrency: groupMoney(
      feeTransactions.map((transaction) => ({
        amount: Math.abs(transaction.fee.amount),
        currency: transaction.fee.currency,
      }))
    ),
    transactions: feeTransactions,
  };
}

async function resolveUserId(requestedUserId?: string) {
  if (requestedUserId) {
    const rows = await db.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
    if (rows[0]) return rows[0];
  }

  const rows = await db.select().from(users).limit(1);
  return rows[0] ?? null;
}

export async function getPortfolioDashboard(
  requestedUserId?: string
): Promise<PortfolioDashboardDto | null> {
  const user = await resolveUserId(requestedUserId);
  if (!user) return null;

  const accountRows = await db.select().from(accounts).where(eq(accounts.userId, user.id));
  const accountIds = accountRows.map((account) => account.id);

  const positionRows =
    accountIds.length === 0
      ? []
      : await db.select().from(positions).where(inArray(positions.accountId, accountIds));

  const transactionRows =
    accountIds.length === 0
      ? []
      : await db
          .select()
          .from(transactions)
          .where(inArray(transactions.accountId, accountIds))
          .orderBy(desc(transactions.tradeDate));

  const accountDtos = accountRows.map(toAccountDto);
  const positionDtos = positionRows.map(toPositionDto);
  const transactionDtos = transactionRows.map(toTransactionDto);
  const enabledTransactionDtos = transactionDtos.filter((transaction) => !transaction.isArchived);
  const recentTransactionDtos = enabledTransactionDtos.slice(0, 25);
  const dividendTransactions = enabledTransactionDtos.filter(isDividendTransaction);
  const accountNameById = new Map(accountDtos.map((account) => [account.id, account.name]));

  const totalValue = positionDtos.reduce(
    (sum, position) => sum + position.marketValue.amount,
    0
  );
  const accountBalanceTotal = accountDtos.reduce(
    (sum, account) => sum + account.balance.amount,
    0
  );
  const totalUnrealizedGainLoss = positionDtos.reduce(
    (sum, position) => sum + (position.unrealizedGainLoss?.amount ?? 0),
    0
  );
  const totalValueByCurrency = groupMoney(
    positionDtos.length > 0
      ? positionDtos.map((position) => position.marketValue)
      : accountDtos.map((account) => account.balance)
  );
  const totalUnrealizedGainLossByCurrency = groupMoney(
    positionDtos
      .map((position) => position.unrealizedGainLoss)
      .filter((value): value is MoneyDto => Boolean(value))
  );
  const syncDates = accountDtos
    .map((account) => account.lastSyncedAt)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    summary: {
      user: {
        id: user.id,
        username: user.username,
      },
      totalValue: {
        amount: totalValue || accountBalanceTotal,
        currency: accountDtos[0]?.balance.currency ?? positionDtos[0]?.marketValue.currency ?? "USD",
      },
      totalValueByCurrency,
      totalUnrealizedGainLoss: {
        amount: totalUnrealizedGainLoss,
        currency: positionDtos[0]?.marketValue.currency ?? accountDtos[0]?.balance.currency ?? "USD",
      },
      totalUnrealizedGainLossByCurrency,
      accountCount: accountDtos.length,
      positionCount: positionDtos.length,
      transactionCount: enabledTransactionDtos.length,
      lastSyncedAt: syncDates.at(-1) ?? null,
    },
    accounts: accountDtos,
    positions: positionDtos.sort((a, b) => b.marketValue.amount - a.marketValue.amount),
    transactions: transactionDtos,
    recentTransactions: recentTransactionDtos,
    allocationByAssetType: buildAllocation(
      positionDtos,
      (position) => position.assetType ?? (position.isCashEquivalent ? "Cash" : "Unclassified")
    ),
    allocationByAccount: buildAllocation(
      positionDtos,
      (position) => accountNameById.get(position.accountId) ?? "Account"
    ),
    dividends: buildDividendSummary(dividendTransactions, accountDtos),
    fees: buildFeeSummary(enabledTransactionDtos),
  };
}
