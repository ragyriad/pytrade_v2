import { toDateOnly } from "../../shared/dates.js";
import { toFiniteNumber } from "../../shared/number-values.js";
import type { ProviderCalendarEvent } from "../../shared/provider-types.js";
import { fetchAlphaVantageText } from "./client.js";
import { parseCsv } from "./csv.js";
import { ALPHA_VANTAGE_SOURCE } from "./tickers.js";

export type AlphaVantageEarningsHorizon = "3month" | "6month" | "12month";

type AlphaVantageEarningsRow = {
  symbol: string;
  name: string;
  reportDate: string;
  fiscalDateEnding: string;
  estimate: string;
  currency: string;
};

function toEarningsRow(
  row: Record<string, string>
): AlphaVantageEarningsRow | null {
  const symbol = row.symbol?.trim().toUpperCase();
  const reportDate = toDateOnly(row.reportDate);
  if (!symbol || !reportDate) return null;

  return {
    symbol,
    name: row.name ?? "",
    reportDate,
    fiscalDateEnding: toDateOnly(row.fiscalDateEnding) ?? "",
    estimate: row.estimate ?? "",
    currency: row.currency ?? "",
  };
}

function optionalNumber(value: string): number | null {
  return value.trim() ? toFiniteNumber(value) : null;
}

export async function fetchAlphaVantageEarningsCalendar(
  horizon: AlphaVantageEarningsHorizon = "3month"
): Promise<ProviderCalendarEvent[]> {
  const params = new URLSearchParams({
    function: "EARNINGS_CALENDAR",
    horizon,
  });
  const csv = await fetchAlphaVantageText(params);

  return parseCsv(csv).flatMap((rawRow) => {
    const row = toEarningsRow(rawRow);
    if (!row) return [];

    const fiscalDateEnding = row.fiscalDateEnding || null;
    return [
      {
        eventType: "earnings",
        eventDate: row.reportDate,
        eventName: row.name ? `${row.name} earnings` : "Earnings",
        eventStatus: "scheduled",
        isEstimated: true,
        source: ALPHA_VANTAGE_SOURCE,
        sourceEventId: `${row.symbol}:${fiscalDateEnding ?? row.reportDate}`,
        providerTicker: row.symbol,
        symbol: row.symbol,
        currencyCode: row.currency || null,
        cashAmount: null,
        exDate: null,
        paymentDate: null,
        recordDate: null,
        declarationDate: null,
        frequency: null,
        distributionType: null,
        isSpecial: false,
        fiscalDateEnding,
        estimatedEps: optionalNumber(row.estimate),
        reportedEps: null,
        rawData: rawRow,
      } satisfies ProviderCalendarEvent,
    ];
  });
}
