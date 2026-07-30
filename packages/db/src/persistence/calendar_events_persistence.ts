import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  calendarEvents,
  type CalendarEvent,
  type NewCalendarEvent,
} from "../schemas/calendar_events_schema.js";

export type CalendarEventQueryOptions = {
  eventType?: string;
  providerSource?: string;
};

export async function upsertCalendarEvents(
  db: DB,
  data: NewCalendarEvent[]
): Promise<CalendarEvent[]> {
  if (data.length === 0) return [];

  const uniqueData = [
    ...new Map(data.map((event) => [event.canonicalKey, event])).values(),
  ];

  return db
    .insert(calendarEvents)
    .values(uniqueData)
    .onConflictDoUpdate({
      target: calendarEvents.canonicalKey,
      set: {
        securityId: sql`excluded.security_id`,
        eventType: sql`excluded.event_type`,
        eventDate: sql`excluded.event_date`,
        eventName: sql`excluded.event_name`,
        eventStatus: sql`excluded.event_status`,
        isEstimated: sql`excluded.is_estimated`,
        providerEventId: sql`excluded.provider_event_id`,
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
        fiscalDateEnding: sql`excluded.fiscal_date_ending`,
        estimatedEps: sql`excluded.estimated_eps`,
        reportedEps: sql`excluded.reported_eps`,
        rawData: sql`excluded.raw_data`,
        updatedAt: sql`now()`,
      },
      setWhere: eq(
        calendarEvents.providerSource,
        sql`excluded.provider_source`
      ),
    })
    .returning();
}

function buildWhere(
  securityIds: string[],
  options: CalendarEventQueryOptions
) {
  const conditions = [inArray(calendarEvents.securityId, securityIds)];
  if (options.eventType) {
    conditions.push(eq(calendarEvents.eventType, options.eventType));
  }
  if (options.providerSource) {
    conditions.push(
      eq(calendarEvents.providerSource, options.providerSource)
    );
  }
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export async function getCalendarEventsBySecurity(
  db: DB,
  securityId: string,
  options: CalendarEventQueryOptions = {}
): Promise<CalendarEvent[]> {
  return db
    .select()
    .from(calendarEvents)
    .where(buildWhere([securityId], options))
    .orderBy(asc(calendarEvents.eventDate));
}

export async function getCalendarEventsBySecurities(
  db: DB,
  securityIds: string[],
  options: CalendarEventQueryOptions = {}
): Promise<CalendarEvent[]> {
  if (securityIds.length === 0) return [];

  return db
    .select()
    .from(calendarEvents)
    .where(buildWhere(securityIds, options))
    .orderBy(asc(calendarEvents.eventDate));
}

export async function getAllCalendarEvents(
  db: DB
): Promise<CalendarEvent[]> {
  return db
    .select()
    .from(calendarEvents)
    .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.symbol));
}

export async function deleteProviderCalendarEventsForSecurities(
  db: DB,
  providerSource: string,
  eventType: string,
  securityIds: string[]
): Promise<number> {
  if (securityIds.length === 0) return 0;

  const deleted = await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.providerSource, providerSource),
        eq(calendarEvents.eventType, eventType),
        inArray(calendarEvents.securityId, securityIds)
      )
    )
    .returning({ id: calendarEvents.id });

  return deleted.length;
}

export async function getDividendEventsBySecurity(
  db: DB,
  securityId: string
): Promise<CalendarEvent[]> {
  return getCalendarEventsBySecurity(db, securityId, {
    eventType: "dividend",
  });
}

export async function getDividendEventsBySecurities(
  db: DB,
  securityIds: string[],
  options: { source?: string } = {}
): Promise<CalendarEvent[]> {
  return getCalendarEventsBySecurities(db, securityIds, {
    eventType: "dividend",
    providerSource: options.source,
  });
}

export const upsertDividendEvents = upsertCalendarEvents;
