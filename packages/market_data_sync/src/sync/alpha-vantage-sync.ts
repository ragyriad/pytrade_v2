import {
  closeDbConnection,
  db,
  deleteProviderCalendarEventsForSecurities,
} from "@repo/db";
import type { DB } from "@repo/db";
import { persistCalendarEvents } from "../persistence/calendar-events.js";
import {
  fetchAlphaVantageEarningsCalendar,
  type AlphaVantageEarningsHorizon,
} from "../providers/alpha-vantage/earnings-calendar.js";
import {
  ALPHA_VANTAGE_SOURCE,
  getAlphaVantageTickerCandidates,
} from "../providers/alpha-vantage/tickers.js";
import type {
  MarketDataSecurity,
  ProviderCalendarEvent,
} from "../shared/provider-types.js";
import { getSecurityUniverse } from "../universe/active-securities.js";
import {
  getCalendarRefreshState,
  shouldRefresh,
} from "./refresh-policy.js";

export type AlphaVantageSyncOptions = {
  horizon?: AlphaVantageEarningsHorizon;
  refreshEarningsAfterDays?: number;
  force?: boolean;
  maxSecurities?: number;
};

export type AlphaVantageSyncResult = {
  provider: "alpha_vantage";
  status: "synced" | "skipped";
  securityCount: number;
  fetchedEventCount: number;
  matchedEventCount: number;
  savedEventCount: number;
  removedStaleEventCount: number;
  unmatchedTickerCount: number;
};

function indexSecurities(securities: MarketDataSecurity[]) {
  const index = new Map<string, MarketDataSecurity[]>();

  for (const security of securities) {
    for (const ticker of getAlphaVantageTickerCandidates(security)) {
      index.set(ticker, [...(index.get(ticker) ?? []), security]);
    }
  }

  return index;
}

export async function syncAlphaVantageMarketData(
  options: AlphaVantageSyncOptions = {},
  database: DB = db
): Promise<AlphaVantageSyncResult> {
  const horizon = options.horizon ?? "3month";
  const refreshAfterDays = options.refreshEarningsAfterDays ?? 1;
  const latestUpdate = await getCalendarRefreshState(
    "earnings",
    ALPHA_VANTAGE_SOURCE,
    database
  );

  if (!shouldRefresh(latestUpdate, refreshAfterDays, options.force ?? false)) {
    return {
      provider: "alpha_vantage",
      status: "skipped",
      securityCount: 0,
      fetchedEventCount: 0,
      matchedEventCount: 0,
      savedEventCount: 0,
      removedStaleEventCount: 0,
      unmatchedTickerCount: 0,
    };
  }

  const securities = await getSecurityUniverse(database, {
    maxSecurities: options.maxSecurities,
  });
  const securitiesByTicker = indexSecurities(securities);
  const events = await fetchAlphaVantageEarningsCalendar(horizon);
  if (events.length === 0) {
    throw new Error(
      "Alpha Vantage returned an empty earnings calendar; existing events were left unchanged."
    );
  }
  const eventsBySecurity = new Map<
    string,
    { security: MarketDataSecurity; events: ProviderCalendarEvent[] }
  >();
  const unmatchedTickers = new Set<string>();
  let matchedEventCount = 0;

  for (const event of events) {
    const matches = securitiesByTicker.get(event.providerTicker);
    if (!matches?.length) {
      unmatchedTickers.add(event.providerTicker);
      continue;
    }

    for (const security of matches) {
      const entry = eventsBySecurity.get(security.id) ?? {
        security,
        events: [],
      };
      entry.events.push(event);
      eventsBySecurity.set(security.id, entry);
      matchedEventCount += 1;
    }
  }

  const removedStaleEventCount =
    await deleteProviderCalendarEventsForSecurities(
      database,
      ALPHA_VANTAGE_SOURCE,
      "earnings",
      securities.map((security) => security.id)
    );
  let savedEventCount = 0;
  for (const { security, events: securityEvents } of eventsBySecurity.values()) {
    const saved = await persistCalendarEvents(
      database,
      security,
      securityEvents
    );
    savedEventCount += saved.length;
  }

  return {
    provider: "alpha_vantage",
    status: "synced",
    securityCount: securities.length,
    fetchedEventCount: events.length,
    matchedEventCount,
    savedEventCount,
    removedStaleEventCount,
    unmatchedTickerCount: unmatchedTickers.size,
  };
}

export async function closeAlphaVantageSyncDbConnection() {
  await closeDbConnection();
}
