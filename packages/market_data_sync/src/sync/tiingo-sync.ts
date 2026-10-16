import { closeDbConnection, db } from "@repo/db";
import type { DB } from "@repo/db";
import { oneYearAgoDateOnly, todayDateOnly } from "../shared/dates.js";
import { fetchTiingoDividendEvents } from "../providers/tiingo/dividends.js";
import {
  isTiingoAuthorizationError,
  TiingoHttpError,
} from "../providers/tiingo/errors.js";
import { resolveTiingoTicker, TIINGO_SOURCE } from "../providers/tiingo/tickers.js";
import type { MarketDataSecurity } from "../shared/provider-types.js";
import { persistDividendEvents } from "../persistence/dividends.js";
import { mapWithConcurrency } from "./concurrency.js";
import { getDividendRefreshState, shouldRefresh } from "./refresh-policy.js";
import { getSecurityUniverse } from "../universe/active-securities.js";

export type TiingoSyncOptions = {
  dividendStartDate?: string;
  dividendEndDate?: string;
  refreshDividendsAfterDays?: number;
  concurrency?: number;
  force?: boolean;
  maxSecurities?: number;
};

export type TiingoSecuritySyncResult = {
  securityId: string;
  symbol: string;
  providerTicker: string;
  dividendStatus: "synced" | "skipped" | "unsupported" | "failed";
  dividendEventCount: number;
  errors: string[];
};

export type TiingoSyncResult = {
  provider: "tiingo";
  securityCount: number;
  dividendEventCount: number;
  results: TiingoSecuritySyncResult[];
};

type SyncContext = Required<
  Pick<
    TiingoSyncOptions,
    | "dividendStartDate"
    | "dividendEndDate"
    | "refreshDividendsAfterDays"
    | "concurrency"
    | "force"
  >
> &
  Pick<TiingoSyncOptions, "maxSecurities">;

type TiingoProviderState = {
  unavailableReason: string | null;
};

function normalizeOptions(options: TiingoSyncOptions = {}): SyncContext {
  return {
    dividendStartDate: options.dividendStartDate ?? oneYearAgoDateOnly(),
    dividendEndDate: options.dividendEndDate ?? todayDateOnly(),
    refreshDividendsAfterDays: options.refreshDividendsAfterDays ?? 7,
    concurrency: options.concurrency ?? 2,
    force: options.force ?? false,
    maxSecurities: options.maxSecurities,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Tiingo sync error";
}

function isTickerNotFound(error: unknown): boolean {
  return error instanceof TiingoHttpError && error.status === 404;
}

async function syncSecurity(
  database: DB,
  security: MarketDataSecurity,
  context: SyncContext,
  dividendRefreshState: Map<string, Date | string | null>,
  providerState: TiingoProviderState
): Promise<TiingoSecuritySyncResult> {
  const providerTicker = resolveTiingoTicker(security);
  const result: TiingoSecuritySyncResult = {
    securityId: security.id,
    symbol: security.symbol,
    providerTicker,
    dividendStatus: "skipped",
    dividendEventCount: 0,
    errors: [],
  };

  const refreshDividends = shouldRefresh(
    dividendRefreshState.get(security.id),
    context.refreshDividendsAfterDays,
    context.force
  );

  if (!refreshDividends) return result;

  if (providerState.unavailableReason) {
    result.dividendStatus = "unsupported";
    result.errors.push(providerState.unavailableReason);
    return result;
  }

  try {
    const events = await fetchTiingoDividendEvents(providerTicker, {
      from: context.dividendStartDate,
      to: context.dividendEndDate,
    });
    const saved = await persistDividendEvents(database, security, events);

    result.dividendStatus = "synced";
    result.dividendEventCount = saved.length;
  } catch (error) {
    const message = errorMessage(error);
    if (isTiingoAuthorizationError(error)) {
      providerState.unavailableReason =
        `Tiingo dividend corporate-actions access is unavailable for this API plan: ${message}`;
      result.dividendStatus = "unsupported";
      result.errors.push(providerState.unavailableReason);
    } else {
      result.dividendStatus = isTickerNotFound(error)
        ? "unsupported"
        : "failed";
      result.errors.push(message);
    }
  }

  return result;
}

export async function syncTiingoMarketData(
  options: TiingoSyncOptions = {},
  database: DB = db
): Promise<TiingoSyncResult> {
  const context = normalizeOptions(options);
  const securities = await getSecurityUniverse(database, context);
  const securityIds = securities.map((security) => security.id);
  const dividendRefreshState = await getDividendRefreshState(
    securityIds,
    TIINGO_SOURCE,
    database
  );
  const providerState: TiingoProviderState = { unavailableReason: null };
  const results = await mapWithConcurrency(
    securities,
    context.concurrency,
    (security) =>
      syncSecurity(
        database,
        security,
        context,
        dividendRefreshState,
        providerState
      )
  );

  return {
    provider: "tiingo",
    securityCount: securities.length,
    dividendEventCount: results.reduce(
      (total, row) => total + row.dividendEventCount,
      0
    ),
    results,
  };
}

export async function closeMarketDataSyncDbConnection() {
  await closeDbConnection();
}
