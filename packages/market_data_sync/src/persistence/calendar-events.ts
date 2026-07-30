import { upsertCalendarEvents } from "@repo/db";
import type { DB, NewCalendarEvent } from "@repo/db";
import type {
  MarketDataSecurity,
  ProviderCalendarEvent,
} from "../shared/provider-types.js";
import { toFixedNumericString } from "../shared/number-values.js";

function calendarKeyPart(value: string | null | undefined): string {
  return value?.trim().toUpperCase() || "-";
}

export function buildCalendarEventCanonicalKey(
  event: ProviderCalendarEvent,
  security: MarketDataSecurity
): string {
  if (event.eventType === "earnings") {
    return [
      security.id,
      "earnings",
      calendarKeyPart(event.fiscalDateEnding ?? event.eventDate),
    ].join(":");
  }

  if (event.eventType === "dividend") {
    return [
      security.id,
      "dividend",
      calendarKeyPart(event.exDate ?? event.eventDate),
      toFixedNumericString(event.cashAmount) ?? "-",
      calendarKeyPart(event.currencyCode ?? security.currencyCode),
    ].join(":");
  }

  return [
    security.id,
    calendarKeyPart(event.eventType),
    calendarKeyPart(event.eventDate),
    calendarKeyPart(event.eventName),
  ].join(":");
}

export function toNewCalendarEvent(
  event: ProviderCalendarEvent,
  security: MarketDataSecurity
): NewCalendarEvent {
  return {
    securityId: security.id,
    eventType: event.eventType,
    eventDate: event.eventDate,
    eventName: event.eventName,
    eventStatus: event.eventStatus,
    isEstimated: event.isEstimated,
    providerSource: event.source,
    providerEventId: event.sourceEventId,
    canonicalKey: buildCalendarEventCanonicalKey(event, security),
    providerTicker: event.providerTicker,
    symbol: security.symbol,
    currencyCode: event.currencyCode ?? security.currencyCode ?? null,
    cashAmount: toFixedNumericString(event.cashAmount),
    exDate: event.exDate,
    paymentDate: event.paymentDate,
    recordDate: event.recordDate,
    declarationDate: event.declarationDate,
    frequency: event.frequency,
    distributionType: event.distributionType,
    isSpecial: event.isSpecial,
    fiscalDateEnding: event.fiscalDateEnding,
    estimatedEps: toFixedNumericString(event.estimatedEps),
    reportedEps: toFixedNumericString(event.reportedEps),
    rawData: event.rawData,
  };
}

export async function persistCalendarEvents(
  database: DB,
  security: MarketDataSecurity,
  events: ProviderCalendarEvent[]
) {
  return upsertCalendarEvents(
    database,
    events.map((event) => toNewCalendarEvent(event, security))
  );
}
