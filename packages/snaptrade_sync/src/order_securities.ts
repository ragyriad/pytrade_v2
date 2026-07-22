import {
  mapSnaptradeOrder,
  upsertSecurities,
  type DB,
  type NewOrder,
  type NewSecurity,
  type Security,
} from "@repo/db";
import {
  buildSecurityKey,
  mapSecurityFromActivity,
  mergeSecurityInputs,
} from "@repo/snaptrade-activity-processor";
import type { AccountOrderRecord } from "snaptrade-typescript-sdk";

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
  const ticker = clean(option?.ticker);
  if (!option || !ticker) return null;

  const timestamp = seenAt(order);
  const underlying = option.underlying_symbol;
  const contractType = clean(option.option_type);
  const expiration = clean(option.expiration_date);
  const description = [
    clean(underlying?.symbol),
    expiration,
    contractType,
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
    instrumentTypeCode: "OPTION",
    instrumentTypeDescription: "OPTION",
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
  const optionTicker = clean(order.option_symbol?.ticker);
  if (optionTicker) return `option:${optionTicker}`;
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
  const securities = byKey(await upsertSecurities(db, securityInputs));
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
