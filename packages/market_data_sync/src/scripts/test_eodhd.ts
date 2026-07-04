import { daysAgoDateOnly, oneYearAgoDateOnly, todayDateOnly } from "../dates.js";
import { loadMarketDataEnv } from "../env.js";
import { fetchEodhdDividendEvents } from "../providers/eodhd/dividends.js";
import { fetchLatestEodhdPriceSnapshot } from "../providers/eodhd/prices.js";

async function main() {
  loadMarketDataEnv();

  const ticker = process.argv.find((arg) => arg.startsWith("--ticker="))?.split("=")[1] ?? "AAPL.US";
  const dividends = await fetchEodhdDividendEvents(ticker, {
    from: oneYearAgoDateOnly(),
    to: todayDateOnly(),
  });
  const price = await fetchLatestEodhdPriceSnapshot(ticker, {
    from: daysAgoDateOnly(10),
    to: todayDateOnly(),
  });

  console.log(
    JSON.stringify(
      {
        ticker,
        dividendEventCount: dividends.length,
        latestPriceDate: price?.priceDate ?? null,
        latestClose: price?.close ?? null,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("EODHD provider smoke test failed:", error);
  process.exitCode = 1;
});
