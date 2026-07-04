import { loadMarketDataEnv } from "../env.js";
import {
  closeMarketDataSyncDbConnection,
  syncEodhdMarketData,
} from "../sync/eodhd-sync.js";
import { parseEodhdSyncArgs } from "./args.js";

function printResult(result: Awaited<ReturnType<typeof syncEodhdMarketData>>) {
  console.log(
    `Synced EODHD market data for ${result.securityCount} securities: ` +
      `${result.dividendEventCount} dividend events, ` +
      `${result.priceSnapshotCount} price snapshots.`
  );

  for (const row of result.results) {
    const errors = row.errors.length > 0 ? ` - ${row.errors.join("; ")}` : "";
    console.log(
      `  ${row.symbol} (${row.providerTicker}): dividends=${row.dividendStatus}/${row.dividendEventCount}, ` +
        `price=${row.priceStatus}/${row.priceSnapshotCount}${errors}`
    );
  }
}

async function main() {
  loadMarketDataEnv();

  const options = parseEodhdSyncArgs(process.argv.slice(2));
  const result = await syncEodhdMarketData(options);
  printResult(result);

  if (
    result.results.some(
      (row) => row.dividendStatus === "failed" || row.priceStatus === "failed"
    )
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("EODHD market data sync failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeMarketDataSyncDbConnection();
  });
