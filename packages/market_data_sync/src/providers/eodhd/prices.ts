import type { DateRange, ProviderPriceSnapshot } from "../types.js";
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

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function toNumber(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
    .filter((row) => row.date && toNumber(row.close) != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];

  if (!latest) return null;

  const priceDate = toDateOnly(latest.date);
  const close = toNumber(latest.close);

  if (!priceDate || close == null) return null;

  return {
    source: EODHD_SOURCE,
    providerTicker,
    symbol: providerTicker,
    currencyCode: null,
    priceDate,
    open: toNumber(latest.open),
    high: toNumber(latest.high),
    low: toNumber(latest.low),
    close,
    adjustedClose: toNumber(latest.adjusted_close ?? latest.adjustedClose),
    volume: toNumber(latest.volume),
    rawData: latest as Record<string, unknown>,
  };
}
