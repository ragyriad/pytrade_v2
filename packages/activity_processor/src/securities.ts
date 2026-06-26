import type { NewSecurity } from "@repo/db";

export type SnapTradeActivitySymbol = {
  id?: string | null;
  symbol?: string | null;
  raw_symbol?: string | null;
  description?: string | null;
  currency?: {
    code?: string | null;
  } | null;
  exchange?: {
    code?: string | null;
    mic_code?: string | null;
    name?: string | null;
  } | null;
  logo_url?: string | null;
  type?: {
    code?: string | null;
    description?: string | null;
  } | null;
  figi_code?: string | null;
  figi_instrument?: {
    figi_code?: string | null;
  } | null;
};

export type SnapTradeActivityLike = {
  symbol?: SnapTradeActivitySymbol | null;
  trade_date?: string | Date | null;
  settlement_date?: string | Date | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function getActivitySeenAt(activity: SnapTradeActivityLike): Date {
  const value = activity.trade_date ?? activity.settlement_date;
  if (!value) return new Date();

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function buildSecurityKey(symbol: SnapTradeActivitySymbol): string | null {
  const snaptradeSymbolId = clean(symbol.id);
  if (snaptradeSymbolId) return `snaptrade:${snaptradeSymbolId}`;

  const figiCode = clean(symbol.figi_code ?? symbol.figi_instrument?.figi_code);
  if (figiCode) return `figi:${figiCode}`;

  const displaySymbol = clean(symbol.symbol);
  if (!displaySymbol) return null;

  const exchange = clean(symbol.exchange?.mic_code ?? symbol.exchange?.code) ?? "unknown";
  return `symbol:${displaySymbol}|exchange:${exchange}`;
}

export function mapSecurityFromActivity(
  activity: SnapTradeActivityLike
): NewSecurity | null {
  const symbol = activity.symbol;
  if (!symbol) return null;

  const securityKey = buildSecurityKey(symbol);
  const displaySymbol = clean(symbol.symbol);
  if (!securityKey || !displaySymbol) return null;

  const seenAt = getActivitySeenAt(activity);

  return {
    securityKey,
    snaptradeSymbolId: clean(symbol.id),
    symbol: displaySymbol,
    rawSymbol: clean(symbol.raw_symbol),
    description: clean(symbol.description),
    currencyCode: clean(symbol.currency?.code),
    exchangeCode: clean(symbol.exchange?.code),
    exchangeMicCode: clean(symbol.exchange?.mic_code),
    exchangeName: clean(symbol.exchange?.name),
    instrumentTypeCode: clean(symbol.type?.code),
    instrumentTypeDescription: clean(symbol.type?.description),
    figiCode: clean(symbol.figi_code),
    figiInstrumentCode: clean(symbol.figi_instrument?.figi_code),
    logoUrl: clean(symbol.logo_url),
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

export function mergeSecurityInputs(inputs: NewSecurity[]): NewSecurity[] {
  const mergedByKey = new Map<string, NewSecurity>();

  for (const input of inputs) {
    const inputFirstSeenAt = input.firstSeenAt ?? new Date();
    const inputLastSeenAt = input.lastSeenAt ?? inputFirstSeenAt;
    const existing = mergedByKey.get(input.securityKey);
    if (!existing) {
      mergedByKey.set(input.securityKey, {
        ...input,
        firstSeenAt: inputFirstSeenAt,
        lastSeenAt: inputLastSeenAt,
      });
      continue;
    }

    const existingFirstSeenAt = existing.firstSeenAt ?? inputFirstSeenAt;
    const existingLastSeenAt = existing.lastSeenAt ?? inputLastSeenAt;
    const firstSeenAt =
      existingFirstSeenAt < inputFirstSeenAt ? existingFirstSeenAt : inputFirstSeenAt;
    const lastSeenAt =
      existingLastSeenAt > inputLastSeenAt ? existingLastSeenAt : inputLastSeenAt;

    mergedByKey.set(input.securityKey, {
      ...existing,
      ...input,
      firstSeenAt,
      lastSeenAt,
    });
  }

  return [...mergedByKey.values()];
}
