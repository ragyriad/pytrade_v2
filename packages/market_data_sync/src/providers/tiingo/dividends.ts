import { toDateOnly } from "../../shared/dates.js";
import { toRequiredFiniteNumber } from "../../shared/number-values.js";
import type { DateRange, ProviderDividendEvent } from "../../shared/provider-types.js";
import { fetchTiingoJson } from "./client.js";
import { TIINGO_SOURCE } from "./tickers.js";

type TiingoDistribution = {
  permaTicker?: string | null;
  ticker?: string | null;
  exDate: string;
  paymentDate?: string | null;
  recordDate?: string | null;
  declarationDate?: string | null;
  distribution: number | string;
  distributionFreqency?: string | null;
  distributionFrequency?: string | null;
  distributionType?: string | null;
  currency?: string | null;
};

function buildSourceEventId(row: TiingoDistribution, fallbackTicker: string): string {
  const ticker = row.ticker ?? fallbackTicker;
  const exDate = toDateOnly(row.exDate) ?? row.exDate;
  const amount = String(row.distribution);
  const permaTicker = row.permaTicker ?? ticker;
  return `${permaTicker}:${ticker}:${exDate}:${amount}`;
}

export async function fetchTiingoDistributions(
  providerTicker: string,
  range: DateRange = {}
): Promise<TiingoDistribution[]> {
  const normalizedTicker = providerTicker.trim().toUpperCase();
  const params = new URLSearchParams();

  if (range.from) params.set("startExDate", range.from);
  if (range.to) params.set("endExDate", range.to);

  return fetchTiingoJson<TiingoDistribution[]>(
    `/tiingo/corporate-actions/${encodeURIComponent(normalizedTicker)}/distributions`,
    params
  );
}

export async function fetchTiingoDividendEvents(
  providerTicker: string,
  range: DateRange = {}
): Promise<ProviderDividendEvent[]> {
  const normalizedTicker = providerTicker.trim().toUpperCase();
  const rows = await fetchTiingoDistributions(normalizedTicker, range);

  return rows.map((row) => {
    const frequency = row.distributionFrequency ?? row.distributionFreqency ?? null;
    const distributionType = row.distributionType ?? null;

    return {
      eventType: "dividend",
      eventDate: toDateOnly(row.exDate) ?? row.exDate,
      eventName: "Dividend",
      eventStatus: null,
      isEstimated: false,
      source: TIINGO_SOURCE,
      sourceEventId: buildSourceEventId(row, normalizedTicker),
      providerTicker: row.ticker ?? normalizedTicker,
      symbol: row.ticker ?? normalizedTicker,
      currencyCode: row.currency ?? null,
      cashAmount: toRequiredFiniteNumber(row.distribution, "Tiingo distribution amount"),
      exDate: toDateOnly(row.exDate) ?? row.exDate,
      paymentDate: toDateOnly(row.paymentDate),
      recordDate: toDateOnly(row.recordDate),
      declarationDate: toDateOnly(row.declarationDate),
      frequency,
      distributionType,
      isSpecial:
        distributionType?.toLowerCase().includes("special") ??
        frequency === "ir",
      fiscalDateEnding: null,
      estimatedEps: null,
      reportedEps: null,
      rawData: row as Record<string, unknown>,
    };
  });
}
