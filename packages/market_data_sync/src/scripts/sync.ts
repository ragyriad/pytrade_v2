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
import { parseEodhdSyncArgs, parseTiingoSyncArgs } from "./args.js";

type MarketDataProvider = "eodhd" | "tiingo";

function readProvider(argv: string[]): MarketDataProvider {
  const providerArg = argv.find((arg) => arg.startsWith("--provider="));
  const provider = providerArg?.split("=")[1]?.toLowerCase() ?? "eodhd";

  if (provider === "eodhd" || provider === "tiingo") return provider;
  throw new Error(`Unsupported market data provider: ${provider}`);
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

  const result = await syncTiingoMarketData(parseTiingoSyncArgs(argv));
  printTiingoResult(result);
  if (hasTiingoFailure(result)) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("Market data sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMarketDataSyncDbConnection();
  });
