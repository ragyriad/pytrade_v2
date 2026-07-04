import type { DateRange, ProviderDividendEvent } from "../types.js";
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

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
    const cashAmount = toNumber(row.value ?? row.unadjustedValue);

    if (!exDate || cashAmount == null) return [];

    return {
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
      rawData: row as Record<string, unknown>,
    };
  });
}
