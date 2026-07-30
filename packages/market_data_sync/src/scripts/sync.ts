import { loadMarketDataEnv } from "../env.js";
import {
  closeMarketDataSyncDbConnection,
  syncEodhdMarketData,
  type EodhdSyncResult,
} from "../sync/eodhd-sync.js";
import {
  syncTiingoMarketData,
  type TiingoSyncResult,
} from "../sync/tiingo-sync.js";
import {
  syncAlphaVantageMarketData,
  type AlphaVantageSyncResult,
} from "../sync/alpha-vantage-sync.js";
import {
  parseAlphaVantageSyncArgs,
  parseEodhdSyncArgs,
  parseTiingoSyncArgs,
} from "./args.js";

type MarketDataProvider = "alpha-vantage" | "eodhd" | "tiingo";

function readProvider(argv: string[]): MarketDataProvider {
  const providerArg = argv.find((arg) => arg.startsWith("--provider="));
  const provider = providerArg?.split("=")[1]?.toLowerCase();

  if (
    provider === "alpha-vantage" ||
    provider === "eodhd" ||
    provider === "tiingo"
  ) {
    return provider;
  }
  throw new Error(
    provider
      ? `Unsupported market data provider: ${provider}`
      : "Missing --provider=alpha-vantage, --provider=eodhd, or --provider=tiingo."
  );
}

function printEodhdResult(result: EodhdSyncResult) {
  console.log(
    `Synced EODHD market data for ${result.securityCount} securities: ` +
      `${result.dividendEventCount} dividend events, ` +
      `${result.priceSnapshotCount} price snapshots, ` +
      `${result.forexRateSnapshotCount} forex rate snapshots.`
  );

  for (const row of result.results) {
    const errors = row.errors.length > 0 ? ` - ${row.errors.join("; ")}` : "";
    console.log(
      `  ${row.symbol} (${row.providerTicker}): dividends=${row.dividendStatus}/${row.dividendEventCount}, ` +
        `price=${row.priceStatus}/${row.priceSnapshotCount}${errors}`
    );
  }

  for (const row of result.forexResults) {
    const errors = row.errors.length > 0 ? ` - ${row.errors.join("; ")}` : "";
    console.log(
      `  FX ${row.pair} (${row.providerTicker}): ${row.status}/${row.snapshotCount}${errors}`
    );
  }
}

function printTiingoResult(result: TiingoSyncResult) {
  console.log(
    `Synced Tiingo market data for ${result.securityCount} securities: ` +
      `${result.dividendEventCount} dividend events.`
  );

  for (const row of result.results) {
    const errors = row.errors.length > 0 ? ` - ${row.errors.join("; ")}` : "";
    console.log(
      `  ${row.symbol} (${row.providerTicker}): dividends=${row.dividendStatus}/${row.dividendEventCount}${errors}`
    );
  }
}

function printAlphaVantageResult(result: AlphaVantageSyncResult) {
  console.log(
    `${result.status === "skipped" ? "Skipped" : "Synced"} Alpha Vantage earnings calendar: ` +
      `${result.fetchedEventCount} fetched, ${result.matchedEventCount} matched, ` +
      `${result.savedEventCount} saved, ${result.removedStaleEventCount} stale removed ` +
      `across ${result.securityCount} securities ` +
      `(${result.unmatchedTickerCount} unmatched tickers).`
  );
}

function hasEodhdFailure(result: EodhdSyncResult): boolean {
  return (
    result.results.some(
      (row) => row.dividendStatus === "failed" || row.priceStatus === "failed"
    ) || result.forexResults.some((row) => row.status === "failed")
  );
}

function hasTiingoFailure(result: TiingoSyncResult): boolean {
  return result.results.some((row) => row.dividendStatus === "failed");
}

async function main() {
  loadMarketDataEnv();

  const argv = process.argv.slice(2);
  const provider = readProvider(argv);

  if (provider === "eodhd") {
    const result = await syncEodhdMarketData(parseEodhdSyncArgs(argv));
    printEodhdResult(result);
    if (hasEodhdFailure(result)) process.exitCode = 1;
    return;
  }

  if (provider === "tiingo") {
    const result = await syncTiingoMarketData(parseTiingoSyncArgs(argv));
    printTiingoResult(result);
    if (hasTiingoFailure(result)) process.exitCode = 1;
    return;
  }

  const result = await syncAlphaVantageMarketData(
    parseAlphaVantageSyncArgs(argv)
  );
  printAlphaVantageResult(result);
}

main()
  .catch((error) => {
    console.error("Market data sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMarketDataSyncDbConnection();
  });
