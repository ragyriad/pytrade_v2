import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  dividendEvents,
  type DividendEvent,
  type NewDividendEvent,
} from "../schemas/dividend_events_schema.js";

export async function upsertDividendEvents(
  db: DB,
  data: NewDividendEvent[]
): Promise<DividendEvent[]> {
  if (data.length === 0) return [];

  return db
    .insert(dividendEvents)
    .values(data)
    .onConflictDoUpdate({
      target: [dividendEvents.source, dividendEvents.sourceEventId],
      set: {
        securityId: sql`excluded.security_id`,
        providerTicker: sql`excluded.provider_ticker`,
        symbol: sql`excluded.symbol`,
        currencyCode: sql`excluded.currency_code`,
        cashAmount: sql`excluded.cash_amount`,
        exDate: sql`excluded.ex_date`,
        paymentDate: sql`excluded.payment_date`,
        recordDate: sql`excluded.record_date`,
        declarationDate: sql`excluded.declaration_date`,
        frequency: sql`excluded.frequency`,
        distributionType: sql`excluded.distribution_type`,
        isSpecial: sql`excluded.is_special`,
        rawData: sql`excluded.raw_data`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}

export async function getDividendEventsBySecurity(
  db: DB,
  securityId: string
): Promise<DividendEvent[]> {
  return db
    .select()
    .from(dividendEvents)
    .where(eq(dividendEvents.securityId, securityId))
    .orderBy(asc(dividendEvents.exDate));
}

export async function getDividendEventsBySecurities(
  db: DB,
  securityIds: string[],
  options: { source?: string } = {}
): Promise<DividendEvent[]> {
  if (securityIds.length === 0) return [];

  return db
    .select()
    .from(dividendEvents)
    .where(
      options.source
        ? and(
            inArray(dividendEvents.securityId, securityIds),
            eq(dividendEvents.source, options.source)
          )
        : inArray(dividendEvents.securityId, securityIds)
    )
    .orderBy(asc(dividendEvents.exDate));
}
