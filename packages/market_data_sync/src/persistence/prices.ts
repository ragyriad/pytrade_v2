import { upsertSecurityPriceSnapshots } from "@repo/db";
import type { DB, NewSecurityPriceSnapshot } from "@repo/db";
import type { MarketDataSecurity, ProviderPriceSnapshot } from "../shared/provider-types.js";
import { toFixedNumericString } from "../shared/number-values.js";

export function toNewSecurityPriceSnapshot(
  snapshot: ProviderPriceSnapshot,
  security: MarketDataSecurity
): NewSecurityPriceSnapshot {
  return {
    securityId: security.id,
    source: snapshot.source,
    providerTicker: snapshot.providerTicker,
    symbol: security.symbol,
    currencyCode: snapshot.currencyCode ?? security.currencyCode ?? null,
    priceDate: snapshot.priceDate,
    open: toFixedNumericString(snapshot.open),
    high: toFixedNumericString(snapshot.high),
    low: toFixedNumericString(snapshot.low),
    close: toFixedNumericString(snapshot.close) ?? "0.000000",
    adjustedClose: toFixedNumericString(snapshot.adjustedClose),
    volume: toFixedNumericString(snapshot.volume),
    rawData: snapshot.rawData,
  };
}

export async function persistPriceSnapshot(
  database: DB,
  security: MarketDataSecurity,
  snapshot: ProviderPriceSnapshot | null
) {
  if (!snapshot) return [];

  return upsertSecurityPriceSnapshots(database, [
    toNewSecurityPriceSnapshot(snapshot, security),
  ]);
}
