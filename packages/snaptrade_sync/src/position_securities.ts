import {
  mapSnaptradePosition,
  upsertSecurities,
  type DB,
  type NewPosition,
  type NewSecurity,
  type Security,
} from "@repo/db";
import {
  buildSecurityKey,
  mergeSecurityInputs,
  type SnapTradeActivitySymbol,
} from "@repo/snaptrade-activity-processor";
import type { Position, PositionSymbol, UniversalSymbol } from "snaptrade-typescript-sdk";

type RawPosition = Position;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

  const securityKey = buildSecurityKey(symbol);
  const displaySymbol = clean(symbol.symbol);
  if (!securityKey || !displaySymbol) return null;

  const seenAt = new Date();

  return {
    securityKey,
    snaptradeSymbolId: clean(symbol.id),
    symbol: displaySymbol,
    rawSymbol: clean(symbol.raw_symbol),
    description: clean(symbol.description),
    currencyCode: clean(position.currency?.code),
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
  const securities = await upsertSecurities(db, mergeSecurityInputs(securityInputs));
  const securitiesByKey = securityByKey(securities);

  return rawPositions.map((position) => {
    const symbol = toActivitySymbol(positionInstrument(position));
    const key = symbol ? buildSecurityKey(symbol) : null;
    const securityId = key ? securitiesByKey.get(key)?.id ?? null : null;

    return mapSnaptradePosition(position, accountId, securityId);
  });
}
