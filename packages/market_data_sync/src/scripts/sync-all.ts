import { loadMarketDataEnv } from "../env.js";
import { closeMarketDataSyncDbConnection } from "../sync/eodhd-sync.js";
import { syncAlphaVantageMarketData } from "../sync/alpha-vantage-sync.js";
import { syncEodhdMarketData } from "../sync/eodhd-sync.js";
import { syncTiingoMarketData } from "../sync/tiingo-sync.js";
import {
  parseAlphaVantageSyncArgs,
  parseEodhdSyncArgs,
  parseTiingoSyncArgs,
} from "./args.js";

type SyncFailure = { provider: string; error: string };

function uniqueErrors(
  rows: Array<{ symbol: string; errors: string[] }>
): string {
  const messages = [
    ...new Set(
      rows.flatMap((row) =>
        row.errors.map((error) => `${row.symbol}: ${error}`)
      )
    ),
  ];
  return messages.slice(0, 8).join("; ");
}

async function main() {
  loadMarketDataEnv();
  const argv = process.argv.slice(2);
  const failures: SyncFailure[] = [];

  try {
    const result = await syncEodhdMarketData(parseEodhdSyncArgs(argv));
    console.log(
      `EODHD: ${result.dividendEventCount} dividends, ` +
        `${result.priceSnapshotCount} prices, ` +
        `${result.forexRateSnapshotCount} FX rates.`
    );
    if (
      result.results.some(
        (row) => row.dividendStatus === "failed" || row.priceStatus === "failed"
      ) ||
      result.forexResults.some((row) => row.status === "failed")
    ) {
      failures.push({
        provider: "eodhd",
        error:
          uniqueErrors(
            result.results.filter(
              (row) =>
                row.dividendStatus === "failed" ||
                row.priceStatus === "failed"
            )
          ) ||
          uniqueErrors(
            result.forexResults
              .filter((row) => row.status === "failed")
              .map((row) => ({ symbol: row.pair, errors: row.errors }))
          ) ||
          "One or more EODHD resources failed.",
      });
    }
  } catch (error) {
    failures.push({
      provider: "eodhd",
      error: error instanceof Error ? error.message : "Unknown EODHD failure",
    });
  }

  try {
    const result = await syncTiingoMarketData(parseTiingoSyncArgs(argv));
    const statusCounts = result.results.reduce(
      (counts, row) => ({
        ...counts,
        [row.dividendStatus]: counts[row.dividendStatus] + 1,
      }),
      { synced: 0, skipped: 0, unsupported: 0, failed: 0 }
    );
    console.log(
      `Tiingo: ${result.dividendEventCount} dividends ` +
        `(${statusCounts.synced} synced, ${statusCounts.skipped} skipped, ` +
        `${statusCounts.unsupported} unsupported, ${statusCounts.failed} failed).`
    );
    if (statusCounts.unsupported > 0) {
      const reason = result.results.find(
        (row) =>
          row.dividendStatus === "unsupported" && row.errors.length > 0
      )?.errors[0];
      console.warn(
        `Tiingo: optional dividend feed unavailable${reason ? ` - ${reason}` : "."}`
      );
    }
    if (statusCounts.failed > 0) {
      failures.push({
        provider: "tiingo",
        error:
          uniqueErrors(
            result.results.filter(
              (row) => row.dividendStatus === "failed"
            )
          ) || "One or more Tiingo resources failed.",
      });
    }
  } catch (error) {
    failures.push({
      provider: "tiingo",
      error: error instanceof Error ? error.message : "Unknown Tiingo failure",
    });
  }

  try {
    const result = await syncAlphaVantageMarketData(
      parseAlphaVantageSyncArgs(argv)
    );
    if (result.status === "skipped") {
      console.log(
        "Alpha Vantage: skipped because earnings were refreshed within the configured one-day window (use --force to refresh now)."
      );
    } else {
      console.log(
        `Alpha Vantage: ${result.fetchedEventCount} fetched, ` +
          `${result.savedEventCount} saved, ${result.removedStaleEventCount} stale removed.`
      );
    }
  } catch (error) {
    failures.push({
      provider: "alpha-vantage",
      error:
        error instanceof Error
          ? error.message
          : "Unknown Alpha Vantage failure",
    });
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`${failure.provider}: ${failure.error}`);
    }
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Market data sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMarketDataSyncDbConnection();
  });
