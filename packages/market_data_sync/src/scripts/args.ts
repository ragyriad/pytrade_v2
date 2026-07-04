import type { EodhdSyncOptions } from "../sync/eodhd-sync.js";

function readNumber(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseEodhdSyncArgs(argv: string[]): EodhdSyncOptions {
  const options: EodhdSyncOptions = {};

  for (const arg of argv) {
    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--includeInactive") {
      options.includeInactive = true;
      continue;
    }

    const [key, value] = arg.split("=");
    if (!value) continue;

    if (key === "--dividendStartDate") options.dividendStartDate = value;
    if (key === "--dividendEndDate") options.dividendEndDate = value;
    if (key === "--priceLookbackDays") options.priceLookbackDays = readNumber(value);
    if (key === "--refreshDividendsAfterDays") {
      options.refreshDividendsAfterDays = readNumber(value);
    }
    if (key === "--refreshPricesAfterDays") {
      options.refreshPricesAfterDays = readNumber(value);
    }
    if (key === "--concurrency") options.concurrency = readNumber(value);
    if (key === "--maxSecurities") options.maxSecurities = readNumber(value);
  }

  return options;
}
