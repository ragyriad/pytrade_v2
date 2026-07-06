import type { DateRange, ProviderForexRateSnapshot } from "../../shared/provider-types.js";
import { toDateOnly } from "../../shared/dates.js";
import { toFiniteNumber } from "../../shared/number-values.js";
import { fetchEodhdJson } from "./client.js";
import { EODHD_SOURCE } from "./tickers.js";

type EodhdForexRate = {
  date?: string | null;
  open?: number | string | null;
  high?: number | string | null;
  low?: number | string | null;
  close?: number | string | null;
  adjusted_close?: number | string | null;
  adjustedClose?: number | string | null;
};

export type NormalizedForexPair = {
  baseCurrency: string;
  quoteCurrency: string;
  providerTicker: string;
};

export function normalizeForexPair(pair: string): NormalizedForexPair {
  const compact = pair
    .trim()
    .toUpperCase()
    .replace(/\.FOREX$/, "")
    .replace(/[^A-Z]/g, "");

  if (!/^[A-Z]{6}$/.test(compact)) {
    throw new Error(`Invalid forex pair "${pair}". Use a pair like USD/CAD or USDCAD.`);
  }

  return {
    baseCurrency: compact.slice(0, 3),
    quoteCurrency: compact.slice(3),
    providerTicker: `${compact}.FOREX`,
  };
}

export async function fetchEodhdForexRateSnapshots(
  pair: string,
  range: DateRange
): Promise<ProviderForexRateSnapshot[]> {
  const normalizedPair = normalizeForexPair(pair);
  const params = new URLSearchParams();
  params.set("period", "d");
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);

  const rows = await fetchEodhdJson<EodhdForexRate[]>(
    `/api/eod/${encodeURIComponent(normalizedPair.providerTicker)}`,
    params
  );

  return rows
    .map((row) => {
      const rateDate = toDateOnly(row.date);
      const close = toFiniteNumber(row.close);

      if (!rateDate || close == null) return null;

      return {
        source: EODHD_SOURCE,
        providerTicker: normalizedPair.providerTicker,
        baseCurrency: normalizedPair.baseCurrency,
        quoteCurrency: normalizedPair.quoteCurrency,
        rateDate,
        open: toFiniteNumber(row.open),
        high: toFiniteNumber(row.high),
        low: toFiniteNumber(row.low),
        close,
        adjustedClose: toFiniteNumber(row.adjusted_close ?? row.adjustedClose),
        rawData: row as Record<string, unknown>,
      } satisfies ProviderForexRateSnapshot;
    })
    .filter((row): row is ProviderForexRateSnapshot => row != null)
    .sort((a, b) => a.rateDate.localeCompare(b.rateDate));
}
