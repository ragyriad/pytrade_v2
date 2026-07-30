import { oneYearAgoDateOnly, daysAgoDateOnly, todayDateOnly } from "../shared/dates.js";
import { loadMarketDataEnv } from "../env.js";
import { fetchEodhdDividendEvents } from "../providers/eodhd/dividends.js";
import { fetchEodhdForexRateSnapshots } from "../providers/eodhd/forex.js";
import { fetchLatestEodhdPriceSnapshot } from "../providers/eodhd/prices.js";
import { fetchTiingoDividendEvents } from "../providers/tiingo/dividends.js";
import { fetchAlphaVantageEarningsCalendar } from "../providers/alpha-vantage/earnings-calendar.js";

type MarketDataProvider = "alpha-vantage" | "eodhd" | "tiingo";

type EndpointResult = {
  status: "ok" | "failed";
  data?: Record<string, unknown>;
  error?: string;
};

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

function readArg(argv: string[], name: string, fallback: string): string {
  return argv.find((arg) => arg.startsWith(`${name}=`))?.split("=")[1] ?? fallback;
}

async function capture(worker: () => Promise<Record<string, unknown>>): Promise<EndpointResult> {
  try {
    return { status: "ok", data: await worker() };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown provider test error",
    };
  }
}

async function testEodhd(argv: string[]) {
  const ticker = readArg(argv, "--ticker", "AAPL.US");
  const fxPair = readArg(argv, "--fxPair", "USD/CAD");
  const dividends = await capture(async () => {
    const rows = await fetchEodhdDividendEvents(ticker, {
      from: oneYearAgoDateOnly(),
      to: todayDateOnly(),
    });

    return {
      ticker,
      dividendEventCount: rows.length,
      latestExDate: rows.at(-1)?.exDate ?? null,
    };
  });
  const price = await capture(async () => {
    const row = await fetchLatestEodhdPriceSnapshot(ticker, {
      from: daysAgoDateOnly(10),
      to: todayDateOnly(),
    });

    return {
      ticker,
      latestPriceDate: row?.priceDate ?? null,
      latestClose: row?.close ?? null,
    };
  });
  const forex = await capture(async () => {
    const rows = await fetchEodhdForexRateSnapshots(fxPair, {
      from: daysAgoDateOnly(10),
      to: todayDateOnly(),
    });
    const latest = rows.at(-1);

    return {
      fxPair,
      rateCount: rows.length,
      latestRateDate: latest?.rateDate ?? null,
      latestClose: latest?.close ?? null,
    };
  });

  return { provider: "eodhd", ticker, fxPair, endpoints: { dividends, price, forex } };
}

async function testTiingo(argv: string[]) {
  const ticker = readArg(argv, "--ticker", "AAPL");
  const dividends = await capture(async () => {
    const rows = await fetchTiingoDividendEvents(ticker, {
      from: oneYearAgoDateOnly(),
      to: todayDateOnly(),
    });

    return {
      ticker,
      dividendEventCount: rows.length,
      latestExDate: rows.at(-1)?.exDate ?? null,
    };
  });

  return { provider: "tiingo", ticker, endpoints: { dividends } };
}

async function testAlphaVantage(argv: string[]) {
  const horizon = readArg(argv, "--horizon", "3month");
  if (
    horizon !== "3month" &&
    horizon !== "6month" &&
    horizon !== "12month"
  ) {
    throw new Error(`Unsupported Alpha Vantage horizon: ${horizon}`);
  }

  const earnings = await capture(async () => {
    const rows = await fetchAlphaVantageEarningsCalendar(horizon);
    return {
      horizon,
      earningsEventCount: rows.length,
      firstReportDate: rows[0]?.eventDate ?? null,
      lastReportDate: rows.at(-1)?.eventDate ?? null,
    };
  });

  return {
    provider: "alpha-vantage",
    horizon,
    endpoints: { earnings },
  };
}

async function main() {
  loadMarketDataEnv();

  const argv = process.argv.slice(2);
  const provider = readProvider(argv);
  const result =
    provider === "eodhd"
      ? await testEodhd(argv)
      : provider === "tiingo"
        ? await testTiingo(argv)
        : await testAlphaVantage(argv);

  console.log(JSON.stringify(result, null, 2));

  const endpointResults = Object.values(result.endpoints);
  if (endpointResults.every((endpoint) => endpoint.status === "failed")) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Provider smoke test failed:", error);
  process.exitCode = 1;
});
