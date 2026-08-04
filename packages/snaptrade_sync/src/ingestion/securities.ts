import type { NewSecurity } from "@repo/db";
import {
  canonicalizeSymbol,
  extractSymbolsFromRawData,
  normalizeSecurityIdentity,
  normalizeSecurityProfile,
  normalizeSecurityType,
  resolveSecurityCandidate,
  type SecurityResolutionCandidate,
} from "@repo/data-normalizer";
import { isSnapTradeOptionActivity } from "./options.js";

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
  id?: string | null;
  symbol?: SnapTradeActivitySymbol | null;
  option_symbol?: {
    id?: string | null;
    ticker?: string | null;
    option_type?: string | null;
    strike_price?: string | number | null;
    expiration_date?: string | Date | null;
    is_mini_option?: boolean | null;
    underlying_symbol?: SnapTradeActivitySymbol | null;
  } | null;
  option_type?: string | null;
  currency?: {
    code?: string | null;
  } | null;
  type?: string | null;
  description?: string | null;
  institution?: string | null;
  external_reference_id?: string | null;
  amount?: string | number | null;
  price?: string | number | null;
  fee?: string | number | null;
  units?: string | number | null;
  trade_date?: string | Date | null;
  settlement_date?: string | Date | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/[_\s]+/g, " ") ?? "";
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

  const displaySymbol = canonicalizeSymbol(symbol.symbol);
  if (!displaySymbol) return null;

  const exchange = clean(symbol.exchange?.mic_code ?? symbol.exchange?.code) ?? "unknown";
  return `symbol:${displaySymbol}|exchange:${exchange}`;
}

function normalizedSecurityType(symbol: SnapTradeActivitySymbol): {
  code: string | null;
  description: string | null;
} {
  const rawCode = normalizeText(symbol.type?.code);
  const rawDescription = normalizeText(symbol.type?.description);
  if (
    rawCode === "OPT" ||
    rawCode === "OPTION" ||
    rawDescription.includes("OPTION")
  ) {
    return { code: null, description: null };
  }
  const normalized = normalizeSecurityType({
    code: clean(symbol.type?.code),
    description: [symbol.type?.description, symbol.description]
      .filter(Boolean)
      .join(" "),
    symbol: symbol.symbol,
  });
  return {
    code: normalized ?? clean(symbol.type?.code),
    description: normalized ?? clean(symbol.type?.description),
  };
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCashFlowActivity(activity: SnapTradeActivityLike): boolean {
  const type = normalizeText(activity.type);
  const description = normalizeText(activity.description);
  const units = toNumber(activity.units);

  if (type === "INTEREST" || description === "INTEREST") return true;
  if (["DEPOSIT", "WITHDRAWAL", "CONTRIBUTION", "INSTITUTIONAL_TRANSFER", "FEE", "P2P_PAYMENT", "REFUND"].includes(type)) {
    return true;
  }

  return units === 0 && ["INTEREST", "CASH"].some((value) => description.includes(value));
}

export function mapSecurityFromActivity(
  activity: SnapTradeActivityLike
): NewSecurity | null {
  if (isSnapTradeOptionActivity(activity)) return null;
  if (isCashFlowActivity(activity)) return null;

  const symbol = activity.symbol;
  if (!symbol) return null;

  const securityKey = buildSecurityKey(symbol);
  const displaySymbol = canonicalizeSymbol(symbol.symbol);
  if (!securityKey || !displaySymbol) return null;

  const seenAt = getActivitySeenAt(activity);
  const securityType = normalizedSecurityType(symbol);
  const profile = normalizeSecurityProfile({
    symbol: displaySymbol,
    description: activity.description ?? symbol.description,
    currencyCode: activity.currency?.code ?? symbol.currency?.code,
    observedAt: seenAt,
  });

  return {
    securityKey,
    snaptradeSymbolId: clean(symbol.id),
    symbol: profile?.symbol ?? displaySymbol,
    rawSymbol: clean(symbol.raw_symbol) ?? clean(symbol.symbol),
    description: profile?.description ?? clean(symbol.description),
    currencyCode:
      profile?.currencyCode ?? clean(symbol.currency?.code),
    exchangeCode: profile?.exchangeCode ?? clean(symbol.exchange?.code),
    exchangeMicCode:
      profile?.exchangeMicCode ?? clean(symbol.exchange?.mic_code),
    exchangeName: profile?.exchangeName ?? clean(symbol.exchange?.name),
    listingStatus: profile?.listingStatus ?? "ACTIVE",
    delistedAt: profile?.delistedAt ?? null,
    instrumentTypeCode: securityType.code,
    instrumentTypeDescription: securityType.description,
    figiCode: clean(symbol.figi_code),
    figiInstrumentCode: clean(symbol.figi_instrument?.figi_code),
    logoUrl: clean(symbol.logo_url),
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

export function mapRecoveredSecurityFromActivity(
  activity: SnapTradeActivityLike
): NewSecurity | null {
  if (activity.symbol || isSnapTradeOptionActivity(activity)) return null;
  const rawSymbol = extractSymbolsFromRawData(activity)[0];
  const symbol = canonicalizeSymbol(rawSymbol);
  if (!symbol) return null;

  const seenAt = getActivitySeenAt(activity);
  const currencyCode = clean(activity.currency?.code);
  const profile = normalizeSecurityProfile({
    symbol,
    description: activity.description,
    currencyCode,
    observedAt: seenAt,
  });
  const securityType = normalizeSecurityType({
    description: activity.description,
    symbol: profile?.symbol ?? symbol,
  }) ?? "SECURITY";
  return {
    securityKey: `recovered:${symbol}|currency:${currencyCode ?? "unknown"}`,
    source: "SNAPTRADE",
    snaptradeSymbolId: null,
    symbol,
    rawSymbol,
    description: profile?.description ?? clean(activity.description) ?? symbol,
    currencyCode: profile?.currencyCode ?? currencyCode,
    exchangeCode: profile?.exchangeCode,
    exchangeMicCode: profile?.exchangeMicCode,
    exchangeName: profile?.exchangeName,
    listingStatus: profile?.listingStatus ?? "ACTIVE",
    delistedAt: profile?.delistedAt ?? null,
    instrumentTypeCode: securityType,
    instrumentTypeDescription: securityType,
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

export type StoredSecurityCandidate = SecurityResolutionCandidate & {
  securityKey: string;
};

export type PreparedSecurityInputs = {
  inputs: NewSecurity[];
  storageKeyByInputKey: Map<string, string>;
};

/**
 * Reuses an existing canonical security when a provider supplies a new key for
 * the same instrument. The returned key map lets callers link provider rows to
 * the reused database security after upsert.
 */
export function prepareSecurityInputs(
  inputs: NewSecurity[],
  candidates: StoredSecurityCandidate[]
): PreparedSecurityInputs {
  const storageKeyByInputKey = new Map<string, string>();
  const aligned = inputs.map((input) => {
    const identity = normalizeSecurityIdentity(input);
    const normalizedInput = {
      ...input,
      symbol: identity.symbol ?? input.symbol,
      rawSymbol: identity.rawSymbol,
    };
    const existing = identity.optionContract
      ? candidates.find(
          (candidate) => candidate.securityKey === normalizedInput.securityKey
        ) ?? null
      : (resolveSecurityCandidate(
          {
            symbol: normalizedInput.symbol,
            description: normalizedInput.description,
            currencyCode: normalizedInput.currencyCode,
            instrumentTypeCode: normalizedInput.instrumentTypeCode,
            rawData: normalizedInput,
          },
          candidates.map((candidate) => ({
            ...candidate,
            isArchived: false,
          }))
        ) as StoredSecurityCandidate | null);
    const storageKey = existing?.securityKey ?? normalizedInput.securityKey;
    storageKeyByInputKey.set(normalizedInput.securityKey, storageKey);
    return {
      ...normalizedInput,
      securityKey: storageKey,
    };
  });

  return {
    inputs: mergeSecurityInputs(aligned),
    storageKeyByInputKey,
  };
}
