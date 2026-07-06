import { upsertForexRateSnapshots } from "@repo/db";
import type { DB, NewForexRateSnapshot } from "@repo/db";
import type { ProviderForexRateSnapshot } from "../shared/provider-types.js";
import { toFixedNumericString } from "../shared/number-values.js";

export function toNewForexRateSnapshot(
  snapshot: ProviderForexRateSnapshot
): NewForexRateSnapshot {
  return {
    source: snapshot.source,
    providerTicker: snapshot.providerTicker,
    baseCurrency: snapshot.baseCurrency,
    quoteCurrency: snapshot.quoteCurrency,
    rateDate: snapshot.rateDate,
    open: toFixedNumericString(snapshot.open, 8),
    high: toFixedNumericString(snapshot.high, 8),
    low: toFixedNumericString(snapshot.low, 8),
    close: toFixedNumericString(snapshot.close, 8) ?? "0.00000000",
    adjustedClose: toFixedNumericString(snapshot.adjustedClose, 8),
    rawData: snapshot.rawData,
  };
}

export async function persistForexRateSnapshots(
  database: DB,
  snapshots: ProviderForexRateSnapshot[]
) {
  return upsertForexRateSnapshots(
    database,
    snapshots.map(toNewForexRateSnapshot)
  );
}
