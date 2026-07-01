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
  description: string;
  optionAction: string | null;
  status: "open" | "closed";
  contractSecurity: NewSecurity;
  underlyingSecurity: NewSecurity;
  option: Omit<NewOption, "securityId" | "underlyingSecurityId">;
};

const months: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

const knownEtfSymbols = new Set([
  "ARKF",
  "DLR.TO",
  "DLR.U.TO",
  "FHLC",
  "HDV",
  "ICLN",
  "IYT",
  "KBWD",
  "SGOV",
  "URNM",
  "XLP",
  "XLU",
]);

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

function parseOptionDate(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }

  const named = normalized.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (named) {
    const month = months[named[2]];
    if (!month) return null;
    return `20${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }

  return null;
}

function parseOptionSide(value: string | null | undefined): "CALL" | "PUT" | null {
  const normalized = normalizeText(value);
  if (normalized.startsWith("C") || normalized.includes("CALL")) return "CALL";
  if (normalized.startsWith("P") || normalized.includes("PUT")) return "PUT";
  return null;
}

function parsedFromParts(input: {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
}): ParsedOccTicker {
  const strikePrice = Number(input.strikePrice).toFixed(6);
  return {
    underlyingSymbol: input.underlyingSymbol.toUpperCase(),
    expirationDate: input.expirationDate,
    contractType: input.contractType,
    strikePrice,
    ticker: formatOccTicker({
      underlyingSymbol: input.underlyingSymbol.toUpperCase(),
      expirationDate: input.expirationDate,
      contractType: input.contractType,
      strikePrice,
    }),
  };
}

function parseOptionFromText(...values: Array<string | null | undefined>): ParsedOccTicker | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const occ = parseOccTicker(normalized);
    if (occ) return occ;

    const spaced = normalized.match(
      /\b([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(PUTS?|CALLS?)\s+(\d+(?:\.\d+)?)\b/
    );
    if (spaced) {
      const expirationDate = parseOptionDate(spaced[2]);
      const contractType = parseOptionSide(spaced[3]);
      if (!expirationDate || !contractType) continue;
      return parsedFromParts({
        underlyingSymbol: spaced[1],
        expirationDate,
        contractType,
        strikePrice: spaced[4],
      });
    }

    const sideFirst = normalized.match(
      /\b(PUTS?|CALLS?)\s+([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d+(?:\.\d+)?)\b/
    );
    if (sideFirst) {
      const expirationDate = parseOptionDate(sideFirst[3]);
      const contractType = parseOptionSide(sideFirst[1]);
      if (!expirationDate || !contractType) continue;
      return parsedFromParts({
        underlyingSymbol: sideFirst[2],
        expirationDate,
        contractType,
        strikePrice: sideFirst[4],
      });
    }
  }

  return null;
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

function inferOptionAction(activity: SnapTradeActivityLike): string | null {
  const action = normalizeText(activity.option_type);
  if (action) return clean(activity.option_type);

  const type = normalizeText(activity.type);
  if (type.includes("BUY")) return "BUY_TO_OPEN";
  if (type.includes("SELL")) return "SELL_TO_CLOSE";
  return null;
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
  const fallbackType = knownEtfSymbols.has(fallbackSymbol) ? "ETF" : "STOCK";
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
    instrumentTypeCode: fallbackType,
    instrumentTypeDescription: fallbackType,
    figiCode: clean(symbol?.figi_code),
    figiInstrumentCode: clean(symbol?.figi_instrument?.figi_code),
    logoUrl: clean(symbol?.logo_url),
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };
}

export function isSnapTradeOptionActivity(activity: SnapTradeActivityLike): boolean {
  const option = activity.option_symbol;
  const parsedFromText = parseOptionFromText(
    option?.ticker,
    activity.description,
    activity.symbol?.symbol,
    activity.symbol?.raw_symbol,
    activity.symbol?.description
  );

  if (!option) {
    return (
      parsedFromText != null &&
      (["BUY", "SELL"].includes(normalizeText(activity.type)) ||
        /\b(OPTIONS?|PUTS?|CALLS?)\b/.test(normalizeText(activity.description)))
    );
  }

  const parsed = parseOccTicker(option.ticker) ?? parsedFromText;
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
  const parsed = parseOccTicker(option?.ticker) ??
    parseOptionFromText(
      activity.description,
      activity.symbol?.symbol,
      activity.symbol?.raw_symbol,
      activity.symbol?.description
    );
  const contractType = optionType(option?.option_type) ?? parsed?.contractType ?? null;
  const strikePrice = toNumber(option?.strike_price)?.toFixed(6) ?? parsed?.strikePrice ?? null;
  const expirationDate = dateString(option?.expiration_date) ?? parsed?.expirationDate ?? null;
  const underlyingSymbol = parsed?.underlyingSymbol ?? normalizeSymbol(option?.underlying_symbol?.symbol);

  if (!contractType || !strikePrice || !expirationDate || !underlyingSymbol) return null;

  const optionAction = inferOptionAction(activity);
  const timestamp = seenAt(activity);
  const matchingUnderlying =
    sameUnderlying(activity.symbol?.symbol, underlyingSymbol)
      ? activity.symbol
      : sameUnderlying(option?.underlying_symbol?.symbol, underlyingSymbol)
        ? option?.underlying_symbol
        : null;
  const currency = clean(activity.currency?.code ?? activity.symbol?.currency?.code);
  const ticker =
    parsed?.ticker ??
    normalizeSymbol(option?.ticker) ??
    formatOccTicker({ underlyingSymbol, expirationDate, contractType, strikePrice });
  const description = `${underlyingSymbol} ${expirationDate} ${contractType} ${Number(strikePrice)}`;

  return {
    ticker,
    description,
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
      snaptradeSymbolId: clean(option?.id),
      symbol: ticker,
      rawSymbol: clean(option?.ticker) ?? ticker,
      description,
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
      isMiniOption: option?.is_mini_option ?? false,
      rawData: (option ?? {
        source: "description",
        description: activity.description,
      }) as Record<string, unknown>,
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
