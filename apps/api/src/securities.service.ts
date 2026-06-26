import {
  accounts,
  db,
  desc,
  eq,
  getHistoricSecuritiesByAccounts,
  getSecurityById,
  getTransactionsBySecurity,
  users,
  type DB,
  type HistoricSecurityRow,
  type Transaction,
  type Account,
} from "@repo/db";
import { buildSecurityGainLoss } from "./business/security-performance.js";

export type MoneyDto = {
  amount: number;
  currency: string;
};

export type HistoricSecurityDto = {
  id: string;
  securityKey: string;
  snaptradeSymbolId: string | null;
  symbol: string;
  rawSymbol: string | null;
  description: string | null;
  currencyCode: string | null;
  exchangeCode: string | null;
  exchangeMicCode: string | null;
  exchangeName: string | null;
  instrumentType: string | null;
  figiCode: string | null;
  logoUrl: string | null;
  transactionCount: number;
  buyCount: number;
  sellCount: number;
  dividendCount: number;
  totalGainLoss: MoneyDto;
  firstTradeDate: string | null;
  lastTradeDate: string | null;
  status: "active" | "closed";
};

export type SecurityTransactionDto = {
  id: string;
  accountId: string;
  accountName: string | null;
  brokerageName: string | null;
  accountType: string | null;
  securityId: string | null;
  source: string;
  type: string;
  description: string | null;
  amount: MoneyDto;
  fee: MoneyDto;
  price: MoneyDto | null;
  units: number | null;
  symbol: string | null;
  tradeDate: string;
};

export type SecurityTransactionsResponseDto = {
  security: HistoricSecurityDto;
  transactions: SecurityTransactionDto[];
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

function toHistoricSecurityDto(row: HistoricSecurityRow): HistoricSecurityDto {
  return {
    id: row.id,
    securityKey: row.securityKey,
    snaptradeSymbolId: row.snaptradeSymbolId,
    symbol: row.symbol,
    rawSymbol: row.rawSymbol,
    description: row.description,
    currencyCode: row.currencyCode,
    exchangeCode: row.exchangeCode,
    exchangeMicCode: row.exchangeMicCode,
    exchangeName: row.exchangeName,
    instrumentType: row.instrumentTypeDescription ?? row.instrumentTypeCode,
    figiCode: row.figiCode,
    logoUrl: row.logoUrl,
    transactionCount: row.transactionCount,
    buyCount: row.buyCount,
    sellCount: row.sellCount,
    dividendCount: row.dividendCount,
    totalGainLoss: buildSecurityGainLoss(
      row.totalGainLossAmount,
      row.totalGainLossCurrency
    ),
    firstTradeDate: toIso(row.firstTradeDate),
    lastTradeDate: toIso(row.lastTradeDate),
    status: row.isCurrentlyHeld ? "active" : "closed",
  };
}

function toTransactionDto(
  transaction: Transaction,
  accountById: Map<string, Account>
): SecurityTransactionDto {
  const currency = transaction.currencyCode ?? "USD";
  const account = accountById.get(transaction.accountId);

  return {
    id: transaction.id,
    accountId: transaction.accountId,
    accountName: account?.name ?? account?.brokerageAccountNumber ?? null,
    brokerageName: account?.brokerageName ?? null,
    accountType: account?.type ?? null,
    securityId: transaction.securityId,
    source: transaction.source,
    type: transaction.type,
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
  };
}

async function resolveUser(database: DB, requestedUserId?: string) {
  if (requestedUserId) {
    const rows = await database.select().from(users).where(eq(users.id, requestedUserId)).limit(1);
    if (rows[0]) return rows[0];
  }

  const rows = await database.select().from(users).limit(1);
  return rows[0] ?? null;
}

async function getUserAccounts(database: DB, requestedUserId?: string) {
  const user = await resolveUser(database, requestedUserId);
  if (!user) return null;

  return database
    .select()
    .from(accounts)
    .where(eq(accounts.userId, user.id))
    .orderBy(desc(accounts.createdAt));
}

export async function getHistoricSecurities(
  requestedUserId?: string,
  database: DB = db
): Promise<HistoricSecurityDto[] | null> {
  const accountRows = await getUserAccounts(database, requestedUserId);
  if (!accountRows) return null;

  const rows = await getHistoricSecuritiesByAccounts(
    database,
    accountRows.map((account) => account.id)
  );

  return rows.map(toHistoricSecurityDto);
}

export async function getSecurityTransactions(
  securityId: string,
  requestedUserId?: string,
  database: DB = db
): Promise<SecurityTransactionsResponseDto | null> {
  const accountRows = await getUserAccounts(database, requestedUserId);
  if (!accountRows) return null;

  const security = await getSecurityById(database, securityId);
  if (!security) return null;

  const accountIds = accountRows.map((account) => account.id);
  const historyRows = await getHistoricSecuritiesByAccounts(database, accountIds);
  const historicSecurity = historyRows.find((row) => row.id === securityId);

  if (!historicSecurity) {
    return {
      security: {
        ...toHistoricSecurityDto({
          ...security,
          transactionCount: 0,
          buyCount: 0,
          sellCount: 0,
          dividendCount: 0,
          totalGainLossAmount: 0,
          totalGainLossCurrency: security.currencyCode ?? "USD",
          firstTradeDate: null,
          lastTradeDate: null,
          isCurrentlyHeld: false,
        }),
      },
      transactions: [],
    };
  }

  const transactionRows = await getTransactionsBySecurity(database, securityId, accountIds);
  const accountById = new Map(accountRows.map((account) => [account.id, account]));

  return {
    security: toHistoricSecurityDto(historicSecurity),
    transactions: transactionRows.map((transaction) =>
      toTransactionDto(transaction, accountById)
    ),
  };
}
