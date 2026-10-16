import type { EodhdSyncOptions } from "../sync/eodhd-sync.js";
import type { TiingoSyncOptions } from "../sync/tiingo-sync.js";
import type { AlphaVantageSyncOptions } from "../sync/alpha-vantage-sync.js";

function readNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readList(value: string | undefined): string[] | undefined {
  const values = value
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values && values.length > 0 ? values : undefined;
}

export function parseEodhdSyncArgs(argv: string[]): EodhdSyncOptions {
  const options: EodhdSyncOptions = {};

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    const [key, value] = arg.split("=");
    if (!value) continue;

    if (key === "--dividendStartDate") options.dividendStartDate = value;
    if (key === "--dividendEndDate") options.dividendEndDate = value;
    if (key === "--priceLookbackDays") options.priceLookbackDays = readNumber(value);
    if (key === "--fxPairs") options.fxPairs = readList(value);
    if (key === "--fxLookbackDays") options.fxLookbackDays = readNumber(value);
    if (key === "--refreshDividendsAfterDays") {
      options.refreshDividendsAfterDays = readNumber(value);
    }
    if (key === "--refreshPricesAfterDays") {
      options.refreshPricesAfterDays = readNumber(value);
    }
    if (key === "--refreshForexAfterDays") {
      options.refreshForexAfterDays = readNumber(value);
    }
    if (key === "--concurrency") options.concurrency = readNumber(value);
    if (key === "--maxSecurities") options.maxSecurities = readNumber(value);
  }

  return options;
}

export function parseTiingoSyncArgs(argv: string[]): TiingoSyncOptions {
  const options: TiingoSyncOptions = {};

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    const [key, value] = arg.split("=");
    if (!value) continue;

    if (key === "--dividendStartDate") options.dividendStartDate = value;
    if (key === "--dividendEndDate") options.dividendEndDate = value;
    if (key === "--refreshDividendsAfterDays") {
      options.refreshDividendsAfterDays = readNumber(value);
    }
    if (key === "--concurrency") options.concurrency = readNumber(value);
    if (key === "--maxSecurities") options.maxSecurities = readNumber(value);
  }

  return options;
}

export function parseAlphaVantageSyncArgs(
  argv: string[]
): AlphaVantageSyncOptions {
  const options: AlphaVantageSyncOptions = {};

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    const [key, value] = arg.split("=");
    if (!value) continue;

    if (
      key === "--horizon" &&
      (value === "3month" || value === "6month" || value === "12month")
    ) {
      options.horizon = value;
    }
    if (key === "--refreshEarningsAfterDays") {
      options.refreshEarningsAfterDays = readNumber(value);
    }
    if (key === "--maxSecurities") options.maxSecurities = readNumber(value);
  }

  return options;
}
