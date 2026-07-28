import {
  securities as securitiesTable,
  upsertSecurities,
  type DB,
  type NewPosition,
  type NewSecurity,
  type Security,
} from "@repo/db";
import { mapSnaptradePosition } from "./mappers/positions_mapper.js";
import {
  buildSecurityKey,
  mergeSecurityInputs,
  prepareSecurityInputs,
  type SnapTradeActivitySymbol,
} from "./ingestion/index.js";
import type { Position, PositionSymbol, UniversalSymbol } from "snaptrade-typescript-sdk";
import {
  canonicalizeSymbol,
  normalizeSecurityProfile,
  normalizeSecurityType,
} from "@repo/data-normalizer";

type RawPosition = Position;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function isOptionInstrument(symbol: SnapTradeActivitySymbol): boolean {
  const code = clean(symbol.type?.code)?.toUpperCase();
  const description = clean(symbol.type?.description)?.toUpperCase();
  return (
    code === "OPT" ||
    code === "OPTION" ||
    Boolean(description?.includes("OPTION"))
  );
}

function positionInstrument(position: RawPosition): UniversalSymbol | undefined {
  const positionSymbol: PositionSymbol | undefined = position.symbol;
  return positionSymbol?.symbol;
}

function toActivitySymbol(
  instrument: UniversalSymbol | undefined
): SnapTradeActivitySymbol | null {
  if (!instrument?.symbol) return null;

  return {
    id: instrument.id ?? null,
    symbol: instrument.symbol ?? null,
    raw_symbol: instrument.raw_symbol ?? null,
    description: instrument.description ?? null,
    currency: null,
    exchange: instrument.exchange
      ? {
          code: instrument.exchange.code ?? null,
          mic_code: instrument.exchange.mic_code ?? null,
          name: instrument.exchange.name ?? null,
        }
      : null,
    logo_url: (instrument.logo_url as string | undefined) ?? null,
    type: instrument.type
      ? {
          code: instrument.type.code ?? null,
          description: instrument.type.description ?? null,
        }
      : null,
    figi_code: instrument.figi_code ?? null,
    figi_instrument: instrument.figi_instrument
      ? {
          figi_code: instrument.figi_instrument.figi_code ?? null,
        }
      : null,
  };
}

function mapSecurityFromPosition(position: RawPosition): NewSecurity | null {
  if (position.cash_equivalent) return null;

  const instrument = positionInstrument(position);
  const symbol = toActivitySymbol(instrument);
  if (!symbol) return null;
  if (isOptionInstrument(symbol)) return null;

  const securityKey = buildSecurityKey(symbol);
  const displaySymbol = canonicalizeSymbol(symbol.symbol);
  if (!securityKey || !displaySymbol) return null;

  const seenAt = new Date();
  const profile = normalizeSecurityProfile({
    symbol: displaySymbol,
    description: symbol.description,
    currencyCode: position.currency?.code,
    observedAt: seenAt,
  });
  const securityType = normalizeSecurityType({
    code: symbol.type?.code,
    description: [symbol.type?.description, symbol.description]
      .filter(Boolean)
      .join(" "),
    symbol: profile?.symbol ?? displaySymbol,
  });
  return {
    securityKey,
    snaptradeSymbolId: clean(symbol.id),
    symbol: displaySymbol,
    rawSymbol: clean(symbol.raw_symbol) ?? clean(symbol.symbol),
    description: profile?.description ?? clean(symbol.description),
    currencyCode: profile?.currencyCode ?? clean(position.currency?.code),
    exchangeCode: profile?.exchangeCode ?? clean(symbol.exchange?.code),
    exchangeMicCode:
      profile?.exchangeMicCode ?? clean(symbol.exchange?.mic_code),
    exchangeName: profile?.exchangeName ?? clean(symbol.exchange?.name),
    listingStatus: profile?.listingStatus ?? "ACTIVE",
    delistedAt: profile?.delistedAt ?? null,
    instrumentTypeCode: securityType,
    instrumentTypeDescription: securityType,
    figiCode: clean(symbol.figi_code),
    figiInstrumentCode: clean(symbol.figi_instrument?.figi_code),
    logoUrl: clean(symbol.logo_url),
    firstSeenAt: seenAt,
    lastSeenAt: seenAt,
  };
}

function securityByKey(rows: Security[]): Map<string, Security> {
  return new Map(rows.map((security) => [security.securityKey, security]));
}

export async function mapSnaptradePositionsWithSecurities(
  db: DB,
  rawPositions: RawPosition[],
  accountId: string
): Promise<NewPosition[]> {
  const securityInputs = rawPositions
    .map(mapSecurityFromPosition)
    .filter((security): security is NewSecurity => Boolean(security));
  const existingSecurities = await db
    .select()
    .from(securitiesTable);
  const prepared = prepareSecurityInputs(
    mergeSecurityInputs(securityInputs),
    existingSecurities
  );
  const securities = await upsertSecurities(db, prepared.inputs);
  const securitiesByKey = securityByKey(securities);
  for (const [inputKey, storageKey] of prepared.storageKeyByInputKey) {
    const security = securitiesByKey.get(storageKey);
    if (security) securitiesByKey.set(inputKey, security);
  }

  return rawPositions.map((position) => {
    const instrument = positionInstrument(position);
    const symbol = toActivitySymbol(positionInstrument(position));
    const key = symbol ? buildSecurityKey(symbol) : null;
    const securityId =
      symbol && isOptionInstrument(symbol)
        ? null
        : key
          ? securitiesByKey.get(key)?.id ?? null
          : null;

    return mapSnaptradePosition(position, accountId, securityId);
  });
}
