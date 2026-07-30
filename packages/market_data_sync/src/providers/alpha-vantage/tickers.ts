import type { MarketDataSecurity } from "../../shared/provider-types.js";

export const ALPHA_VANTAGE_SOURCE = "alpha_vantage";

function normalized(value: string | null | undefined): string | null {
  const result = value?.trim().toUpperCase();
  return result || null;
}

export function getAlphaVantageTickerCandidates(
  security: MarketDataSecurity
): string[] {
  const candidates = new Set<string>();
  const rawSymbol = normalized(security.rawSymbol);
  const symbol = normalized(security.symbol);
  const exchange = [
    security.exchangeCode,
    security.exchangeMicCode,
    security.exchangeName,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();
  const isTsxVenture =
    exchange.includes("TSXV") || exchange.includes("XTSX");
  const isTsx =
    isTsxVenture || exchange.includes("TSX") || exchange.includes("XTSE");
  const symbolWithoutCanadianSuffix = symbol?.replace(/\.(TO|V)$/, "") ?? null;
  const baseSymbol = rawSymbol ?? symbolWithoutCanadianSuffix ?? symbol;

  if (baseSymbol && isTsxVenture) {
    candidates.add(`${baseSymbol}.TRV`);
  } else if (baseSymbol && isTsx) {
    candidates.add(`${baseSymbol}.TRT`);
  } else {
    if (rawSymbol) candidates.add(rawSymbol);
    if (symbol) candidates.add(symbol);
  }

  return [...candidates];
}
