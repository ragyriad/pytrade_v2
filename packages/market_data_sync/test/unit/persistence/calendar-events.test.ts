import { assert, test } from "vitest";
import type {
  MarketDataSecurity,
  ProviderCalendarEvent,
} from "../../../src/shared/provider-types.js";
import { buildCalendarEventCanonicalKey } from "../../../src/persistence/calendar-events.js";

const security: MarketDataSecurity = {
  id: "5a4ce604-89c1-4d4b-a1d7-3041be95283a",
  symbol: "AAPL",
  rawSymbol: "AAPL",
  currencyCode: "USD",
  exchangeCode: "NASDAQ",
  exchangeMicCode: "XNAS",
  exchangeName: "Nasdaq",
};

function earningsEvent(
  source: string,
  eventDate: string
): ProviderCalendarEvent {
  return {
    eventType: "earnings",
    eventDate,
    eventName: "Apple earnings",
    eventStatus: "scheduled",
    isEstimated: true,
    source,
    sourceEventId: `${source}:AAPL:2026-06-30`,
    providerTicker: "AAPL",
    symbol: "AAPL",
    currencyCode: "USD",
    cashAmount: null,
    exDate: null,
    paymentDate: null,
    recordDate: null,
    declarationDate: null,
    frequency: null,
    distributionType: null,
    isSpecial: false,
    fiscalDateEnding: "2026-06-30",
    estimatedEps: 1.42,
    reportedEps: null,
    rawData: {},
  };
}

test("earnings canonical key is provider-independent and stable when expected date changes", () => {
  assert.equal(
    buildCalendarEventCanonicalKey(
      earningsEvent("alpha_vantage", "2026-07-30"),
      security
    ),
    buildCalendarEventCanonicalKey(
      earningsEvent("another_provider", "2026-08-01"),
      security
    )
  );
});

test("dividend canonical key is provider-independent", () => {
  const base = {
    ...earningsEvent("eodhd", "2026-08-07"),
    eventType: "dividend",
    eventName: "Dividend",
    isEstimated: false,
    cashAmount: 0.24,
    exDate: "2026-08-07",
    fiscalDateEnding: null,
    estimatedEps: null,
  } satisfies ProviderCalendarEvent;

  assert.equal(
    buildCalendarEventCanonicalKey(base, security),
    buildCalendarEventCanonicalKey(
      { ...base, source: "tiingo", sourceEventId: "tiingo-event" },
      security
    )
  );
});
