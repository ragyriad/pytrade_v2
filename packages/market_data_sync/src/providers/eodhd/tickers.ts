import type { MarketDataSecurity } from "../types.js";

const EODHD_SOURCE = "EODHD";
const CANADIAN_EXCHANGE_CODES = new Set(["CA", "CN", "TO", "TSX", "TSXV", "NEO"]);
const CANADIAN_MIC_CODES = new Set(["XTSE", "XTSX", "XTOR", "NEOE"]);
const KNOWN_EODHD_SUFFIXES = new Set([
  "US",
  "TO",
  "V",
  "CN",
  "NEO",
]);

export { EODHD_SOURCE };

function hasKnownEodhdSuffix(symbol: string): boolean {
  const suffix = symbol.match(/\.([A-Z]{1,4})$/)?.[1];
  return suffix ? KNOWN_EODHD_SUFFIXES.has(suffix) : false;
}

function resolveExchangeSuffix(security: MarketDataSecurity): string {
  const exchangeCode = security.exchangeCode?.toUpperCase();
  const exchangeMicCode = security.exchangeMicCode?.toUpperCase();
  const currencyCode = security.currencyCode?.toUpperCase();

  if (
    (exchangeCode && CANADIAN_EXCHANGE_CODES.has(exchangeCode)) ||
    (exchangeMicCode && CANADIAN_MIC_CODES.has(exchangeMicCode)) ||
    currencyCode === "CAD"
  ) {
    return "TO";
  }

  return "US";
}

export function resolveEodhdTicker(security: MarketDataSecurity): string {
  const symbol = (security.rawSymbol ?? security.symbol).trim().toUpperCase();
  if (hasKnownEodhdSuffix(symbol)) return symbol;
  return `${symbol}.${resolveExchangeSuffix(security)}`;
}

export function getEodhdTickerAlternates(ticker: string): string[] {
  const normalized = ticker.trim().toUpperCase();
  const alternates = [normalized];
  const suffixMatch = normalized.match(/^(.+)\.([A-Z]{2,4})$/);

  if (suffixMatch) {
    const [, base, suffix] = suffixMatch;
    if (base.includes(".")) alternates.push(`${base.replace(/\./g, "-")}.${suffix}`);
  }

  return [...new Set(alternates)];
}
