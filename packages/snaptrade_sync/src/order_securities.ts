import {
  securities as securitiesTable,
  upsertSecurities,
  type DB,
  type NewOrder,
  type NewSecurity,
  type Security,
} from "@repo/db";
import { mapSnaptradeOrder } from "./mappers/order_mapper.js";
import {
  buildSecurityKey,
  mapSecurityFromActivity,
  mergeSecurityInputs,
  prepareSecurityInputs,
} from "./ingestion/index.js";
import type { AccountOrderRecord } from "snaptrade-typescript-sdk";
import {
  canonicalizeSymbol,
  formatOccTicker,
  parseOptionContract,
} from "@repo/data-normalizer";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function seenAt(order: AccountOrderRecord): Date {
  const value = order.time_placed;
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function optionSecurity(order: AccountOrderRecord): NewSecurity | null {
  const option = order.option_symbol;
  if (!option) return null;
  const parsed = parseOptionContract(
    option.ticker,
    [
      option.underlying_symbol?.symbol,
      option.expiration_date,
      option.option_type,
      option.strike_price,
    ]
      .filter((value) => value != null)
      .join(" ")
  );
  const underlyingSymbol = canonicalizeSymbol(option.underlying_symbol?.symbol);
  const expiration = clean(option.expiration_date);
  const normalizedContractType =
    clean(option.option_type)?.toUpperCase().startsWith("C") ? "CALL" : "PUT";
  const ticker =
    parsed?.ticker ??
    (underlyingSymbol && expiration && option.strike_price != null
      ? formatOccTicker({
          underlyingSymbol,
          expirationDate: expiration,
          contractType: normalizedContractType,
          strikePrice: option.strike_price,
        })
      : clean(option.ticker));
  if (!ticker) return null;

  const timestamp = seenAt(order);
  const underlying = option.underlying_symbol;
  const rawContractType = clean(option.option_type);
  const normalizedExpiration = parsed?.expirationDate ?? expiration;
  const description = [
    clean(underlying?.symbol),
    normalizedExpiration,
    rawContractType,
    option.strike_price == null ? null : String(option.strike_price),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    securityKey: `option:${ticker}`,
    // The order response's option id is deprecated; the OCC ticker is stable.
    snaptradeSymbolId: null,
    symbol: ticker,
    rawSymbol: ticker,
    description: description || ticker,
    currencyCode: clean(underlying?.currency?.code),
    instrumentTypeCode: null,
    instrumentTypeDescription: null,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };
}

function orderSecurity(order: AccountOrderRecord): NewSecurity | null {
  if (order.option_symbol) return optionSecurity(order);
  if (!order.universal_symbol) return null;

  return mapSecurityFromActivity({
    symbol: order.universal_symbol,
    trade_date: order.time_placed,
  });
}

function orderSecurityKey(order: AccountOrderRecord): string | null {
  const mappedOption = order.option_symbol ? optionSecurity(order) : null;
  if (mappedOption) return mappedOption.securityKey;
  return order.universal_symbol ? buildSecurityKey(order.universal_symbol) : null;
}

function byKey(rows: Security[]): Map<string, Security> {
  return new Map(rows.map((security) => [security.securityKey, security]));
}

export async function mapSnaptradeOrdersWithSecurities(
  db: DB,
  rawOrders: AccountOrderRecord[],
  accountId: string
): Promise<NewOrder[]> {
  const securityInputs = mergeSecurityInputs(
    rawOrders
      .map(orderSecurity)
      .filter((security): security is NewSecurity => security !== null)
  );
  const existingSecurities = await db
    .select()
    .from(securitiesTable);
  const prepared = prepareSecurityInputs(securityInputs, existingSecurities);
  const securities = byKey(await upsertSecurities(db, prepared.inputs));
  for (const [inputKey, storageKey] of prepared.storageKeyByInputKey) {
    const security = securities.get(storageKey);
    if (security) securities.set(inputKey, security);
  }
  const mappedByBrokerageId = new Map<string, NewOrder>();

  for (const order of rawOrders) {
    const key = orderSecurityKey(order);
    const mapped = mapSnaptradeOrder(
      order,
      accountId,
      key ? securities.get(key)?.id ?? null : null
    );
    if (mapped) mappedByBrokerageId.set(mapped.brokerageOrderId, mapped);
  }

  return [...mappedByBrokerageId.values()];
}
