import { closeDbConnection, db } from "@repo/db";
import type { DB } from "@repo/db";
import { daysAgoDateOnly, oneYearAgoDateOnly, todayDateOnly } from "../shared/dates.js";
import { EodhdHttpError } from "../providers/eodhd/errors.js";
import { fetchEodhdDividendEvents } from "../providers/eodhd/dividends.js";
import { fetchLatestEodhdPriceSnapshot } from "../providers/eodhd/prices.js";
import {
  EODHD_SOURCE,
  getEodhdTickerAlternates,
  resolveEodhdTicker,
} from "../providers/eodhd/tickers.js";
import type { MarketDataSecurity } from "../shared/provider-types.js";
import { persistDividendEvents } from "../persistence/dividends.js";
import { persistPriceSnapshot } from "../persistence/prices.js";
import { mapWithConcurrency } from "./concurrency.js";
import {
  getDividendRefreshState,
  getPriceRefreshState,
  shouldRefresh,
} from "./refresh-policy.js";
import { getSecurityUniverse } from "../universe/active-securities.js";

export type EodhdSyncOptions = {
  dividendStartDate?: string;
  dividendEndDate?: string;
  priceLookbackDays?: number;
  refreshDividendsAfterDays?: number;
  refreshPricesAfterDays?: number;
  concurrency?: number;
  force?: boolean;
  includeInactive?: boolean;
  maxSecurities?: number;
};

export type EodhdSecuritySyncResult = {
  securityId: string;
  symbol: string;
  providerTicker: string;
  dividendStatus: "synced" | "skipped" | "unsupported" | "failed";
  priceStatus: "synced" | "skipped" | "unsupported" | "failed";
  dividendEventCount: number;
  priceSnapshotCount: number;
  errors: string[];
};

export type EodhdSyncResult = {
  provider: "eodhd";
  securityCount: number;
  dividendEventCount: number;
  priceSnapshotCount: number;
  results: EodhdSecuritySyncResult[];
};

type SyncContext = Required<
  Pick<
    EodhdSyncOptions,
    | "dividendStartDate"
    | "dividendEndDate"
    | "priceLookbackDays"
    | "refreshDividendsAfterDays"
    | "refreshPricesAfterDays"
    | "concurrency"
    | "force"
    | "includeInactive"
  >
> &
  Pick<EodhdSyncOptions, "maxSecurities">;

function normalizeOptions(options: EodhdSyncOptions = {}): SyncContext {
  return {
    dividendStartDate: options.dividendStartDate ?? oneYearAgoDateOnly(),
    dividendEndDate: options.dividendEndDate ?? todayDateOnly(),
    priceLookbackDays: options.priceLookbackDays ?? 10,
    refreshDividendsAfterDays: options.refreshDividendsAfterDays ?? 7,
    refreshPricesAfterDays: options.refreshPricesAfterDays ?? 1,
    concurrency: options.concurrency ?? 2,
    force: options.force ?? false,
    includeInactive: options.includeInactive ?? false,
    maxSecurities: options.maxSecurities,
  };
}

async function tryTickerAlternates<T>(
  security: MarketDataSecurity,
  worker: (providerTicker: string) => Promise<T>
): Promise<{ providerTicker: string; value: T }> {
  const tickers = getEodhdTickerAlternates(resolveEodhdTicker(security));
  let lastError: unknown;

  for (const providerTicker of tickers) {
    try {
      return { providerTicker, value: await worker(providerTicker) };
    } catch (error) {
      lastError = error;
      if (!(error instanceof EodhdHttpError) || error.status !== 404) break;
    }
  }

  throw lastError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown EODHD sync error";
}

function isTickerNotFound(error: unknown): boolean {
  return error instanceof EodhdHttpError && error.status === 404;
}

async function syncSecurity(
  database: DB,
  security: MarketDataSecurity,
  context: SyncContext,
  dividendRefreshState: Map<string, Date | string | null>,
  priceRefreshState: Map<string, Date | string | null>
): Promise<EodhdSecuritySyncResult> {
  const defaultTicker = resolveEodhdTicker(security);
  const result: EodhdSecuritySyncResult = {
    securityId: security.id,
    symbol: security.symbol,
    providerTicker: defaultTicker,
    dividendStatus: "skipped",
    priceStatus: "skipped",
    dividendEventCount: 0,
    priceSnapshotCount: 0,
    errors: [],
  };

  const refreshDividends = shouldRefresh(
    dividendRefreshState.get(security.id),
    context.refreshDividendsAfterDays,
    context.force
  );
  const refreshPrices = shouldRefresh(
    priceRefreshState.get(security.id),
    context.refreshPricesAfterDays,
    context.force
  );

  if (refreshDividends) {
    try {
      const { providerTicker, value } = await tryTickerAlternates(security, (ticker) =>
        fetchEodhdDividendEvents(ticker, {
          from: context.dividendStartDate,
          to: context.dividendEndDate,
        })
      );

      result.providerTicker = providerTicker;
      const saved = await persistDividendEvents(database, security, value);
      result.dividendStatus = "synced";
      result.dividendEventCount = saved.length;
    } catch (error) {
      result.dividendStatus = isTickerNotFound(error) ? "unsupported" : "failed";
      result.errors.push(errorMessage(error));
    }
  }

  if (refreshPrices) {
    try {
      const { providerTicker, value } = await tryTickerAlternates(security, (ticker) =>
        fetchLatestEodhdPriceSnapshot(ticker, {
          from: daysAgoDateOnly(context.priceLookbackDays),
          to: todayDateOnly(),
        })
      );

      result.providerTicker = providerTicker;
      const saved = await persistPriceSnapshot(database, security, value);
      result.priceStatus = saved.length > 0 ? "synced" : "failed";
      result.priceSnapshotCount = saved.length;
      if (saved.length === 0) result.errors.push("No EOD price row returned.");
    } catch (error) {
      result.priceStatus = isTickerNotFound(error) ? "unsupported" : "failed";
      result.errors.push(errorMessage(error));
    }
  }

  return result;
}

export async function syncEodhdMarketData(
  options: EodhdSyncOptions = {},
  database: DB = db
): Promise<EodhdSyncResult> {
  const context = normalizeOptions(options);
  const securities = await getSecurityUniverse(database, context);
  const securityIds = securities.map((security) => security.id);
  const [dividendRefreshState, priceRefreshState] = await Promise.all([
    getDividendRefreshState(securityIds, EODHD_SOURCE, database),
    getPriceRefreshState(securityIds, EODHD_SOURCE, database),
  ]);

  const results = await mapWithConcurrency(
    securities,
    context.concurrency,
    (security) =>
      syncSecurity(
        database,
        security,
        context,
        dividendRefreshState,
        priceRefreshState
      )
  );

  return {
    provider: "eodhd",
    securityCount: securities.length,
    dividendEventCount: results.reduce(
      (total, row) => total + row.dividendEventCount,
      0
    ),
    priceSnapshotCount: results.reduce(
      (total, row) => total + row.priceSnapshotCount,
      0
    ),
    results,
  };
}

export async function closeMarketDataSyncDbConnection() {
  await closeDbConnection();
}
