import type { DateRange, ProviderPriceSnapshot } from "../../shared/provider-types.js";
import { toDateOnly } from "../../shared/dates.js";
import { toFiniteNumber } from "../../shared/number-values.js";
import { fetchEodhdJson } from "./client.js";
import { EODHD_SOURCE } from "./tickers.js";

type EodhdEodPrice = {
  date?: string | null;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  adjusted_close?: number | string | null;
  adjustedClose?: number | string | null;
  volume?: number | string | null;
};

export async function fetchLatestEodhdPriceSnapshot(
  providerTicker: string,
  range: DateRange
): Promise<ProviderPriceSnapshot | null> {
  const params = new URLSearchParams();
  params.set("period", "d");
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);

  const rows = await fetchEodhdJson<EodhdEodPrice[]>(
    `/api/eod/${encodeURIComponent(providerTicker)}`,
    params
  );

  const latest = rows
    .filter((row) => row.date && toFiniteNumber(row.close) != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  if (!latest) return null;

  const priceDate = toDateOnly(latest.date);
  const close = toFiniteNumber(latest.close);

  if (!priceDate || close == null) return null;

  return {
    source: EODHD_SOURCE,
    providerTicker,
    symbol: providerTicker,
    currencyCode: null,
    priceDate,
    open: toFiniteNumber(latest.open),
    high: toFiniteNumber(latest.high),
    low: toFiniteNumber(latest.low),
    close,
    adjustedClose: toFiniteNumber(latest.adjusted_close ?? latest.adjustedClose),
    volume: toFiniteNumber(latest.volume),
    rawData: latest as Record<string, unknown>,
  };
}
