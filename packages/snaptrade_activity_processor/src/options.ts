import type { NewOption, NewSecurity } from "@repo/db";
import type { SnapTradeActivityLike, SnapTradeActivitySymbol } from "./securities.js";

type ParsedOccTicker = {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  ticker: string;
};

export type MappedOption = {
  ticker: string;
  optionAction: string | null;
  status: "open" | "closed";
  contractSecurity: NewSecurity;
  underlyingSecurity: NewSecurity;
  option: Omit<NewOption, "securityId" | "underlyingSecurityId">;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function normalizeSymbol(value: string | null | undefined): string | null {
  return clean(value)?.toUpperCase() ?? null;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateString(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function seenAt(activity: SnapTradeActivityLike): Date {
  const value = activity.trade_date ?? activity.settlement_date;
  if (!value) return new Date();

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildSecurityKey(symbol: SnapTradeActivitySymbol): string | null {
  const snaptradeSymbolId = clean(symbol.id);
  if (snaptradeSymbolId) return `snaptrade:${snaptradeSymbolId}`;

  const figiCode = clean(symbol.figi_code ?? symbol.figi_instrument?.figi_code);
  if (figiCode) return `figi:${figiCode}`;

  const displaySymbol = clean(symbol.symbol);
  if (!displaySymbol) return null;

  const exchange = clean(symbol.exchange?.mic_code ?? symbol.exchange?.code) ?? "unknown";
  return `symbol:${displaySymbol}|exchange:${exchange}`;
}

function parseOccTicker(value: string | null | undefined): ParsedOccTicker | null {
  const normalized = clean(value)?.replace(/\s+/g, "").toUpperCase();
  if (!normalized) return null;

  const match = normalized?.match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
  if (!match) return null;

  const [, underlyingSymbol, yymmdd, side, strikeRaw] = match;
  const year = Number(`20${yymmdd.slice(0, 2)}`);
  const month = Number(yymmdd.slice(2, 4));
  const day = Number(yymmdd.slice(4, 6));
  const strike = Number(strikeRaw) / 1000;

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(strike)
  ) {
    return null;
  }

  return {
    underlyingSymbol,
    expirationDate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    contractType: side === "C" ? "CALL" : "PUT",
    strikePrice: strike.toFixed(6),
    ticker: normalized,
  };
}

function formatOccTicker(input: {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
}): string {
  const [year, month, day] = input.expirationDate.split("-");
  const side = input.contractType === "CALL" ? "C" : "P";
  const strike = Math.round(Number(input.strikePrice) * 1000)
    .toString()
    .padStart(8, "0");
  return `${input.underlyingSymbol}${year.slice(2)}${month}${day}${side}${strike}`;
}

function sameUnderlying(symbol: string | null | undefined, root: string): boolean {
  const normalized = normalizeSymbol(symbol);
  return normalized === root || normalized?.replace(/\.(TO|NE|V|CN)$/i, "") === root;
}

function optionStatus(optionAction: string | null): "open" | "closed" {
  const action = normalizeText(optionAction);
  if (action.includes("CLOSE")) return "closed";
  return "open";
}

function optionType(value: string | null | undefined): "CALL" | "PUT" | null {
  const normalized = normalizeText(value);
  if (normalized === "C" || normalized.includes("CALL")) return "CALL";
  if (normalized === "P" || normalized.includes("PUT")) return "PUT";
  return null;
}

function securityFromSymbol(
  symbol: SnapTradeActivitySymbol | null | undefined,
  fallbackSymbol: string,
  fallbackCurrency: string | null,
  timestamp: Date
): NewSecurity {
  const displaySymbol = clean(symbol?.symbol) ?? fallbackSymbol;
  const securityKey =
    symbol && sameUnderlying(symbol.symbol, fallbackSymbol)
      ? buildSecurityKey(symbol) ?? `symbol:${displaySymbol}|exchange:unknown`
      : `symbol:${fallbackSymbol}|exchange:unknown`;

  return {
    securityKey,
    snaptradeSymbolId: symbol && sameUnderlying(symbol.symbol, fallbackSymbol) ? clean(symbol.id) : null,
    symbol: displaySymbol,
    rawSymbol: clean(symbol?.raw_symbol) ?? fallbackSymbol,
    description: clean(symbol?.description) ?? fallbackSymbol,
    currencyCode: clean(symbol?.currency?.code) ?? fallbackCurrency,
    exchangeCode: clean(symbol?.exchange?.code),
    exchangeMicCode: clean(symbol?.exchange?.mic_code),
    exchangeName: clean(symbol?.exchange?.name),
    instrumentTypeCode: "STOCK",
    instrumentTypeDescription: "STOCK",
    figiCode: clean(symbol?.figi_code),
    figiInstrumentCode: clean(symbol?.figi_instrument?.figi_code),
    logoUrl: clean(symbol?.logo_url),
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };
}

export function isSnapTradeOptionActivity(activity: SnapTradeActivityLike): boolean {
  const option = activity.option_symbol;
  if (!option) return false;

  const parsed = parseOccTicker(option.ticker);
  const action = normalizeText(activity.option_type);
  const description = normalizeText(activity.description);
  const hasContractFacts =
    parsed != null ||
    optionType(option.option_type) != null ||
    option.strike_price != null ||
    option.expiration_date != null;

  return (
    hasContractFacts &&
    (action.includes("OPEN") ||
      action.includes("CLOSE") ||
      normalizeText(activity.type).includes("OPTION") ||
      /\b(OPTIONS?|PUTS?|CALLS?)\b/.test(description) ||
      parsed != null)
  );
}

export function mapOptionFromActivity(
  activity: SnapTradeActivityLike
): MappedOption | null {
  if (!isSnapTradeOptionActivity(activity)) return null;

  const option = activity.option_symbol;
  if (!option) return null;

  const parsed = parseOccTicker(option.ticker);
  const contractType = optionType(option.option_type) ?? parsed?.contractType ?? null;
  const strikePrice = toNumber(option.strike_price)?.toFixed(6) ?? parsed?.strikePrice ?? null;
  const expirationDate = dateString(option.expiration_date) ?? parsed?.expirationDate ?? null;
  const underlyingSymbol = parsed?.underlyingSymbol ?? normalizeSymbol(option.underlying_symbol?.symbol);

  if (!contractType || !strikePrice || !expirationDate || !underlyingSymbol) return null;

  const optionAction = clean(activity.option_type);
  const timestamp = seenAt(activity);
  const matchingUnderlying =
    sameUnderlying(activity.symbol?.symbol, underlyingSymbol)
      ? activity.symbol
      : sameUnderlying(option.underlying_symbol?.symbol, underlyingSymbol)
        ? option.underlying_symbol
        : null;
  const currency = clean(activity.currency?.code ?? activity.symbol?.currency?.code);
  const ticker =
    parsed?.ticker ??
    normalizeSymbol(option.ticker) ??
    formatOccTicker({ underlyingSymbol, expirationDate, contractType, strikePrice });

  return {
    ticker,
    optionAction,
    status: optionStatus(optionAction),
    underlyingSecurity: securityFromSymbol(
      matchingUnderlying,
      underlyingSymbol,
      currency,
      timestamp
    ),
    contractSecurity: {
      securityKey: `option:${ticker}`,
      snaptradeSymbolId: clean(option.id),
      symbol: ticker,
      rawSymbol: clean(option.ticker) ?? ticker,
      description: `${underlyingSymbol} ${expirationDate} ${contractType} ${Number(strikePrice)}`,
      currencyCode: currency,
      exchangeCode: clean(activity.symbol?.exchange?.code),
      exchangeMicCode: clean(activity.symbol?.exchange?.mic_code),
      exchangeName: clean(activity.symbol?.exchange?.name),
      instrumentTypeCode: "OPTION",
      instrumentTypeDescription: "OPTION",
      figiCode: null,
      figiInstrumentCode: null,
      logoUrl: null,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    },
    option: {
      ticker,
      contractType,
      strikePrice,
      expirationDate,
      multiplier: "100",
      status: optionStatus(optionAction),
      isMiniOption: option.is_mini_option ?? false,
      rawData: option as Record<string, unknown>,
      firstSeenAt: timestamp,
      lastSeenAt: timestamp,
    },
  };
}

export function mergeOptionMappings(
  inputs: MappedOption[]
): MappedOption[] {
  const merged = new Map<string, MappedOption>();

  for (const input of inputs) {
    const existing = merged.get(input.ticker);
    if (!existing) {
      merged.set(input.ticker, input);
      continue;
    }

    const firstSeenAt =
      existing.option.firstSeenAt! < input.option.firstSeenAt!
        ? existing.option.firstSeenAt!
        : input.option.firstSeenAt!;
    const lastSeenAt =
      existing.option.lastSeenAt! > input.option.lastSeenAt!
        ? existing.option.lastSeenAt!
        : input.option.lastSeenAt!;
    const latest =
      existing.option.lastSeenAt! > input.option.lastSeenAt! ? existing : input;

    merged.set(input.ticker, {
      ...latest,
      option: {
        ...latest.option,
        firstSeenAt,
        lastSeenAt,
      },
      contractSecurity: {
        ...latest.contractSecurity,
        firstSeenAt,
        lastSeenAt,
      },
      underlyingSecurity: {
        ...latest.underlyingSecurity,
        firstSeenAt,
        lastSeenAt,
      },
    });
  }

  return [...merged.values()];
}
