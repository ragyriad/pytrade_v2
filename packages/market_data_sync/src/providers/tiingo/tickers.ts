import type { MarketDataSecurity } from "../../shared/provider-types.js";

export const TIINGO_SOURCE = "TIINGO";

export function resolveTiingoTicker(security: MarketDataSecurity): string {
  return (security.rawSymbol ?? security.symbol).trim().toUpperCase();
}
