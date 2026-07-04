import { upsertSecurityPriceSnapshots } from "@repo/db";
import type { DB, NewSecurityPriceSnapshot } from "@repo/db";
import type { MarketDataSecurity, ProviderPriceSnapshot } from "../providers/types.js";

function toNumericString(value: number | null): string | null {
  return value == null ? null : value.toFixed(6);
}

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
    open: toNumericString(snapshot.open),
    high: toNumericString(snapshot.high),
    low: toNumericString(snapshot.low),
    close: toNumericString(snapshot.close) ?? "0.000000",
    adjustedClose: toNumericString(snapshot.adjustedClose),
    volume: toNumericString(snapshot.volume),
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
