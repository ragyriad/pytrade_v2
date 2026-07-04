import { upsertDividendEvents } from "@repo/db";
import type { DB, NewDividendEvent } from "@repo/db";
import type { ProviderDividendEvent, MarketDataSecurity } from "../providers/types.js";

function toNumericString(value: number): string {
  return value.toFixed(6);
}

export function toNewDividendEvent(
  event: ProviderDividendEvent,
  security: MarketDataSecurity
): NewDividendEvent {
  return {
    securityId: security.id,
    source: event.source,
    sourceEventId: event.sourceEventId,
    providerTicker: event.providerTicker,
    symbol: security.symbol,
    currencyCode: event.currencyCode ?? security.currencyCode ?? null,
    cashAmount: toNumericString(event.cashAmount),
    exDate: event.exDate,
    paymentDate: event.paymentDate,
    recordDate: event.recordDate,
    declarationDate: event.declarationDate,
    frequency: event.frequency,
    distributionType: event.distributionType,
    isSpecial: event.isSpecial,
    rawData: event.rawData,
  };
}

export async function persistDividendEvents(
  database: DB,
  security: MarketDataSecurity,
  events: ProviderDividendEvent[]
) {
  return upsertDividendEvents(
    database,
    events.map((event) => toNewDividendEvent(event, security))
  );
}
