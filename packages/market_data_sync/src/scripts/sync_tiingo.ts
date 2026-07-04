import { loadMarketDataEnv } from "../env.js";
import {
  closeMarketDataSyncDbConnection,
  syncTiingoMarketData,
} from "../sync/tiingo-sync.js";
import { parseTiingoSyncArgs } from "./args.js";

function printResult(result: Awaited<ReturnType<typeof syncTiingoMarketData>>) {
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

async function main() {
  loadMarketDataEnv();

  const options = parseTiingoSyncArgs(process.argv.slice(2));
  const result = await syncTiingoMarketData(options);
  printResult(result);

  if (result.results.some((row) => row.dividendStatus === "failed")) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("Tiingo market data sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMarketDataSyncDbConnection();
  });
