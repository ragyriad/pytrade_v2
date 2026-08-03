import {
  accounts,
  and,
  asc,
  calendarEvents,
  db,
  eq,
  inArray,
  like,
  ne,
  or,
  positions,
  transactions,
  type CalendarEvent,
} from "@repo/db";

export type CalendarEventDto = {
  id: string;
  securityId: string | null;
  eventType: string;
  eventDate: string;
  eventName: string | null;
  eventStatus: string | null;
  isEstimated: boolean;
  providerSource: string;
  providerTicker: string;
  symbol: string;
  currencyCode: string | null;
  cashAmount: number | null;
  exDate: string | null;
  paymentDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  frequency: string | null;
  distributionType: string | null;
  isSpecial: boolean;
  fiscalDateEnding: string | null;
  estimatedEps: number | null;
  reportedEps: number | null;
};

function toDateOnly(
  value: Date | string | null | undefined
): string | null {
  if (!value) return null;
  return typeof value === "string"
    ? value.slice(0, 10)
    : value.toISOString().slice(0, 10);
}

function toNumber(value: string | number | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCalendarEventDto(event: CalendarEvent): CalendarEventDto {
  return {
    id: event.id,
    securityId: event.securityId,
    eventType: event.eventType,
    eventDate: toDateOnly(event.eventDate) ?? "",
    eventName: event.eventName,
    eventStatus: event.eventStatus,
    isEstimated: event.isEstimated,
    providerSource: event.providerSource,
    providerTicker: event.providerTicker,
    symbol: event.symbol,
    currencyCode: event.currencyCode,
    cashAmount: toNumber(event.cashAmount),
    exDate: toDateOnly(event.exDate),
    paymentDate: toDateOnly(event.paymentDate),
    recordDate: toDateOnly(event.recordDate),
    declarationDate: toDateOnly(event.declarationDate),
    frequency: event.frequency,
    distributionType: event.distributionType,
    isSpecial: event.isSpecial,
    fiscalDateEnding: toDateOnly(event.fiscalDateEnding),
    estimatedEps: toNumber(event.estimatedEps),
    reportedEps: toNumber(event.reportedEps),
  };
}

export async function getCalendarEvents(userId: string): Promise<CalendarEventDto[]> {
  const ownedAccounts = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isArchived, false)));
  const accountIds = ownedAccounts.map((account) => account.id);
  if (accountIds.length === 0) return [];

  const [heldSecurities, tradedSecurities] = await Promise.all([
    db
      .select({ securityId: positions.securityId })
      .from(positions)
      .where(inArray(positions.accountId, accountIds)),
    db
      .select({ securityId: transactions.securityId, underlyingSecurityId: transactions.underlyingSecurityId })
      .from(transactions)
      .where(inArray(transactions.accountId, accountIds)),
  ]);
  const securityIds = [...new Set([
    ...heldSecurities.map((row) => row.securityId),
    ...tradedSecurities.flatMap((row) => [row.securityId, row.underlyingSecurityId]),
  ].filter((value): value is string => Boolean(value)))];
  if (securityIds.length === 0) return [];

  const events: CalendarEvent[] = await db
    .select()
    .from(calendarEvents)
    .where(
      and(
        inArray(calendarEvents.securityId, securityIds),
        or(
          ne(calendarEvents.providerSource, "DEMO"),
          like(calendarEvents.providerEventId, `${userId}:%`)
        )
      )
    )
    .orderBy(asc(calendarEvents.eventDate), asc(calendarEvents.symbol));
  return events.map(toCalendarEventDto);
}
