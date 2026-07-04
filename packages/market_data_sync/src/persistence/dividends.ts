import { upsertDividendEvents } from "@repo/db";
import type { DB, NewDividendEvent } from "@repo/db";
import type { ProviderDividendEvent, MarketDataSecurity } from "../shared/provider-types.js";
import { toFixedNumericString } from "../shared/number-values.js";

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
    cashAmount: toFixedNumericString(event.cashAmount) ?? "0.000000",
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
