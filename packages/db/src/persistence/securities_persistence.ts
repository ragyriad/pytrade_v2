import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { DB } from "../db_type.js";
import { positions } from "../schemas/positions_schema.js";
import {
  securities,
  Security,
  NewSecurity,
} from "../schemas/securities_schema.js";
import {
  transactions,
  Transaction,
} from "../schemas/transactions_schema.js";

export type HistoricSecurityRow = Security & {
  transactionCount: number;
  buyCount: number;
  sellCount: number;
  dividendCount: number;
  totalGainLossAmount: number;
  totalBuyCostAmount: number;
  totalGainLossCurrency: string;
  firstTradeDate: Date | null;
  lastTradeDate: Date | null;
  isCurrentlyHeld: boolean;
};

export async function getHistoricSecurityAccountIds(
  db: DB,
  accountIds: string[]
): Promise<Array<{ securityId: string; accountId: string }>> {
  if (accountIds.length === 0) return [];

  const rows = await db
    .select({
      securityId: sql<string | null>`coalesce(${transactions.underlyingSecurityId}, ${transactions.securityId})`,
      accountId: transactions.accountId,
    })
    .from(transactions)
    .where(and(inArray(transactions.accountId, accountIds), eq(transactions.isArchived, false)))
    .groupBy(
      sql`coalesce(${transactions.underlyingSecurityId}, ${transactions.securityId})`,
      transactions.accountId
    );

  return rows.filter((row): row is { securityId: string; accountId: string } => row.securityId != null);
}

export async function upsertSecurities(
  db: DB,
  data: NewSecurity[]
): Promise<Security[]> {
  if (data.length === 0) return [];

  return db
    .insert(securities)
    .values(data)
    .onConflictDoUpdate({
      target: [securities.securityKey],
      set: {
        source: sql`excluded.source`,
        listingStatus: sql`case when ${securities.listingStatus} = 'DELISTED' then ${securities.listingStatus} else excluded.listing_status end`,
        delistedAt: sql`coalesce(excluded.delisted_at, ${securities.delistedAt})`,
        snaptradeSymbolId: sql`coalesce(excluded.snaptrade_symbol_id, ${securities.snaptradeSymbolId})`,
        symbol: sql`excluded.symbol`,
        rawSymbol: sql`coalesce(excluded.raw_symbol, ${securities.rawSymbol})`,
        description: sql`coalesce(excluded.description, ${securities.description})`,
        currencyCode: sql`coalesce(excluded.currency_code, ${securities.currencyCode})`,
        exchangeCode: sql`coalesce(excluded.exchange_code, ${securities.exchangeCode})`,
        exchangeMicCode: sql`coalesce(excluded.exchange_mic_code, ${securities.exchangeMicCode})`,
        exchangeName: sql`coalesce(excluded.exchange_name, ${securities.exchangeName})`,
        instrumentTypeCode: sql`coalesce(excluded.instrument_type_code, ${securities.instrumentTypeCode})`,
        instrumentTypeDescription: sql`coalesce(excluded.instrument_type_description, ${securities.instrumentTypeDescription})`,
        figiCode: sql`coalesce(excluded.figi_code, ${securities.figiCode})`,
        figiInstrumentCode: sql`coalesce(excluded.figi_instrument_code, ${securities.figiInstrumentCode})`,
        logoUrl: sql`coalesce(excluded.logo_url, ${securities.logoUrl})`,
        isArchived: sql`${securities.isArchived} and excluded.is_archived`,
        firstSeenAt: sql`least(${securities.firstSeenAt}, excluded.first_seen_at)`,
        lastSeenAt: sql`greatest(${securities.lastSeenAt}, excluded.last_seen_at)`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}

export async function getSecurityById(
  db: DB,
  id: string
): Promise<Security | null> {
  const rows = await db
    .select()
    .from(securities)
    .where(and(eq(securities.id, id), eq(securities.isArchived, false)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getSecurityByKey(
  db: DB,
  securityKey: string
): Promise<Security | null> {
  const rows = await db
    .select()
    .from(securities)
    .where(
      and(
        eq(securities.securityKey, securityKey),
        eq(securities.isArchived, false)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getTransactionsBySecurity(
  db: DB,
  securityId: string,
  accountIds?: string[]
): Promise<Transaction[]> {
  if (accountIds && accountIds.length === 0) return [];

  const securityPredicate = or(
    eq(transactions.securityId, securityId),
    eq(transactions.underlyingSecurityId, securityId)
  );

  return db
    .select()
    .from(transactions)
    .where(
      accountIds
        ? and(
            securityPredicate,
            inArray(transactions.accountId, accountIds),
            eq(transactions.isArchived, false)
          )
        : and(securityPredicate, eq(transactions.isArchived, false))
    )
    .orderBy(desc(transactions.tradeDate));
}

export async function getHistoricSecuritiesByAccounts(
  db: DB,
  accountIds: string[]
): Promise<HistoricSecurityRow[]> {
  if (accountIds.length === 0) return [];

  const activePositionRows = await db
    .select({ symbol: positions.symbol })
    .from(positions)
    .where(inArray(positions.accountId, accountIds));
  const activeSymbols = new Set(activePositionRows.map((position) => position.symbol));

  const rows = await db
    .select({
      security: securities,
      transactionCount: sql<number>`count(${transactions.id})`,
      buyCount: sql<number>`sum(case when upper(coalesce(${transactions.action}, ${transactions.type})) like '%BUY%' then 1 else 0 end)`,
      sellCount: sql<number>`sum(case when upper(coalesce(${transactions.action}, ${transactions.type})) like '%SELL%' then 1 else 0 end)`,
      dividendCount: sql<number>`sum(case when upper(coalesce(${transactions.action}, ${transactions.type})) like '%DIVIDEND%' then 1 else 0 end)`,
      totalGainLossAmount: sql<number>`coalesce(sum(${transactions.amount}), 0) - coalesce(sum(abs(${transactions.fee})), 0)`,
      totalBuyCostAmount: sql<number>`coalesce(sum(case when upper(coalesce(${transactions.action}, ${transactions.type})) like '%BUY%' then abs(${transactions.amount}) + abs(${transactions.fee}) else 0 end), 0)`,
      totalGainLossCurrency: sql<string>`coalesce(${securities.currencyCode}, max(${transactions.currencyCode}), 'USD')`,
      firstTradeDate: sql<Date | null>`min(${transactions.tradeDate})`,
      lastTradeDate: sql<Date | null>`max(${transactions.tradeDate})`,
    })
    .from(securities)
    .innerJoin(
      transactions,
      sql`coalesce(${transactions.underlyingSecurityId}, ${transactions.securityId}) = ${securities.id}`
    )
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        eq(transactions.isArchived, false),
        eq(securities.isArchived, false)
      )
    )
    .groupBy(securities.id)
    .orderBy(sql`max(${transactions.tradeDate}) desc`);

  return rows.map((row) => ({
    ...row.security,
    transactionCount: Number(row.transactionCount),
    buyCount: Number(row.buyCount),
    sellCount: Number(row.sellCount),
    dividendCount: Number(row.dividendCount),
    totalGainLossAmount: Number(row.totalGainLossAmount),
    totalBuyCostAmount: Number(row.totalBuyCostAmount),
    totalGainLossCurrency: row.totalGainLossCurrency,
    firstTradeDate: row.firstTradeDate,
    lastTradeDate: row.lastTradeDate,
    isCurrentlyHeld: activeSymbols.has(row.security.symbol),
  }));
}
