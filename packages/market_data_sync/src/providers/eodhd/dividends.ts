import type { DateRange, ProviderDividendEvent } from "../../shared/provider-types.js";
import { toDateOnly } from "../../shared/dates.js";
import { toFiniteNumber } from "../../shared/number-values.js";
import { fetchEodhdJson } from "./client.js";
import { EODHD_SOURCE } from "./tickers.js";

type EodhdDividend = {
  date?: string | null;
  exDate?: string | null;
  declarationDate?: string | null;
  recordDate?: string | null;
  paymentDate?: string | null;
  value?: number | string | null;
  unadjustedValue?: number | string | null;
  currency?: string | null;
};

function buildSourceEventId(row: EodhdDividend, providerTicker: string): string {
  const exDate = toDateOnly(row.date ?? row.exDate) ?? "unknown-date";
  const amount = String(row.value ?? row.unadjustedValue ?? "unknown-value");
  return `${providerTicker}:${exDate}:${amount}`;
}

export async function fetchEodhdDividendEvents(
  providerTicker: string,
  range: DateRange
): Promise<ProviderDividendEvent[]> {
  const params = new URLSearchParams();
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);

  const rows = await fetchEodhdJson<EodhdDividend[]>(
    `/api/div/${encodeURIComponent(providerTicker)}`,
    params
  );

  return rows.flatMap((row) => {
    const exDate = toDateOnly(row.date ?? row.exDate);
    const cashAmount = toFiniteNumber(row.value ?? row.unadjustedValue);

    if (!exDate || cashAmount == null) return [];

    return {
      eventType: "dividend",
      eventDate: exDate,
      eventName: "Dividend",
      eventStatus: null,
      isEstimated: false,
      source: EODHD_SOURCE,
      sourceEventId: buildSourceEventId(row, providerTicker),
      providerTicker,
      symbol: providerTicker,
      currencyCode: row.currency ?? null,
      cashAmount,
      exDate,
      paymentDate: toDateOnly(row.paymentDate),
      recordDate: toDateOnly(row.recordDate),
      declarationDate: toDateOnly(row.declarationDate),
      frequency: null,
      distributionType: "cash",
      isSpecial: false,
      fiscalDateEnding: null,
      estimatedEps: null,
      reportedEps: null,
      rawData: row as Record<string, unknown>,
    };
  });
}
