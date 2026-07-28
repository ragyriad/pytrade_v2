import type { Position, PositionSymbol, UniversalSymbol } from "snaptrade-typescript-sdk";
import type { NewPosition } from "@repo/db";
 
export type RawPosition = Position;
 
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
 
function safeNumeric(value: number | null | undefined): string | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n.toString();
}
 
function safeString(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.trim() || null;
}
 
// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------
 
export function mapSnaptradePosition(
  raw: RawPosition,
  accountId: string,
  securityId?: string | null
): NewPosition {
  // Position.symbol       → PositionSymbol  (position-scoped wrapper)
  // Position.symbol.symbol → UniversalSymbol (the actual instrument)
  const positionSymbol: PositionSymbol | undefined = raw.symbol;
  const instrument: UniversalSymbol | undefined = positionSymbol?.symbol;
 
  return {
    accountId,
    securityId: securityId ?? null,
 
    // ------------------------------------------------------------------
    // Identity
    // PositionSymbol.id is deprecated by SnapTrade — kept for now as a
    // fallback reference but do not rely on it being stable.
    // UniversalSymbol.id is the stable SnapTrade instrument identifier.
    // ------------------------------------------------------------------
    snaptradeSymbolId: safeString(positionSymbol?.id),
    snaptradeInstrumentId: safeString(instrument?.id),
 
    // UniversalSymbol.symbol includes the exchange suffix (e.g. "VAB.TO")
    // UniversalSymbol.raw_symbol strips the suffix (e.g. "VAB")
    symbol: instrument?.symbol ?? "",
    description: safeString(instrument?.description),
    rawSymbol: safeString(instrument?.raw_symbol),
 
    // ------------------------------------------------------------------
    // Exchange — from UniversalSymbol.exchange (SymbolExchange)
    // mic_code is the globally standardised exchange identifier (ISO 10383)
    // ------------------------------------------------------------------
    exchangeCode: safeString(instrument?.exchange?.code),
    exchangeMicCode: safeString(instrument?.exchange?.mic_code),
    exchangeName: safeString(instrument?.exchange?.name),
 
    // ------------------------------------------------------------------
    // Position sizing
    // units covers both whole and fractional units going forward.
    // fractional_units is deprecated by SnapTrade but kept for brokerages
    // that still return it separately.
    // ------------------------------------------------------------------
    units: safeNumeric(raw.units) ?? "0",
    fractionalUnits: safeNumeric(raw.fractional_units),
 
    // ------------------------------------------------------------------
    // Pricing & P&L
    // price and average_purchase_price are in the position currency
    // (raw.currency), not necessarily the instrument's listing currency.
    // ------------------------------------------------------------------
    price: safeNumeric(raw.price),
    averagePurchasePrice: safeNumeric(raw.average_purchase_price),
    openPnl: safeNumeric(raw.open_pnl),
 
    // ------------------------------------------------------------------
    // Currency — PositionCurrency (position-level, not instrument-level)
    // This is the currency the brokerage uses to hold and value the position.
    // It can differ from the instrument's listing currency.
    // ------------------------------------------------------------------
    currencyCode: safeString(raw.currency?.code),
 
    // ------------------------------------------------------------------
    // Flags
    // cash_equivalent — true for money market funds and cash positions.
    // is_quotable / is_tradable — deprecated on PositionSymbol per SDK docs.
    // Reading them here still works but SnapTrade may stop populating them.
    // ------------------------------------------------------------------
    cashEquivalent: raw.cash_equivalent ?? false,
    isQuotable: positionSymbol?.is_quotable ?? false,
    isTradable: positionSymbol?.is_tradable ?? false,
 
    // ------------------------------------------------------------------
    // Asset classification — from UniversalSymbol.type (SecurityType)
    // Common codes: "cs" = Common Stock, "et" = ETF, "bnd" = Bond,
    // "crypto" = Cryptocurrency, "oef" = Open Ended Fund
    // ------------------------------------------------------------------
    instrumentTypeCode: safeString(instrument?.type?.code),
    instrumentTypeDescription: safeString(instrument?.type?.description),
 
    // ------------------------------------------------------------------
    // FIGI — globally unique instrument identifiers (OpenFIGI standard)
    // figi_code on UniversalSymbol is the composite FIGI for this venue.
    // figi_instrument.figi_code is the venue-level FIGI.
    // ------------------------------------------------------------------
    figiCode: safeString(instrument?.figi_code),
    figiInstrumentCode: safeString(instrument?.figi_instrument?.figi_code),
 
    // Logo URL sourced from the instrument — used directly in the UI.
    // Not present on Position or PositionSymbol, only on UniversalSymbol.
    logoUrl: safeString(instrument?.logo_url as string | undefined),
  };
}
