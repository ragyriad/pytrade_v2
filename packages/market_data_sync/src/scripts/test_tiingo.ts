import { oneYearAgoDateOnly, todayDateOnly } from "../shared/dates.js";
import { loadMarketDataEnv } from "../env.js";
import { fetchTiingoDividendEvents } from "../providers/tiingo/dividends.js";

async function main() {
  loadMarketDataEnv();

  const ticker =
    process.argv.find((arg) => arg.startsWith("--ticker="))?.split("=")[1] ?? "AAPL";
  const dividends = await fetchTiingoDividendEvents(ticker, {
    from: oneYearAgoDateOnly(),
    to: todayDateOnly(),
  });

  console.log(
    JSON.stringify(
      {
        ticker,
        dividendEventCount: dividends.length,
        latestExDate: dividends.at(-1)?.exDate ?? null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("Tiingo provider smoke test failed:", error);
  process.exitCode = 1;
});
