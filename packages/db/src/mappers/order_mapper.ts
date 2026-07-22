import type { AccountOrderRecord as SnaptradeOrder } from "snaptrade-typescript-sdk";
import type { NewOrder } from "../schemas/orders_schema.js";

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function numericString(value: string | number | null | undefined): string | null {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? String(value) : null;
}

function dateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function mapSnaptradeOrder(
  rawOrder: SnaptradeOrder,
  accountId: string,
  securityId?: string | null
): NewOrder | null {
  const brokerageOrderId = clean(rawOrder.brokerage_order_id);
  if (!brokerageOrderId) return null;

  return {
    accountId,
    securityId: securityId ?? null,
    brokerageOrderId,
    brokerageGroupOrderId: clean(rawOrder.brokerage_group_order_id),
    orderRole: clean(rawOrder.order_role),
    status: clean(rawOrder.status) ?? "NONE",
    action: clean(rawOrder.action),
    totalQuantity: numericString(rawOrder.total_quantity),
    openQuantity: numericString(rawOrder.open_quantity),
    filledQuantity: numericString(rawOrder.filled_quantity),
    executionPrice: numericString(rawOrder.execution_price),
    limitPrice: numericString(rawOrder.limit_price),
    stopPrice: numericString(rawOrder.stop_price),
    trailingStopAmount: numericString(rawOrder.trailing_stop?.amount),
    trailingStopType: clean(rawOrder.trailing_stop?.type),
    quoteSymbol: clean(
      rawOrder.quote_universal_symbol?.symbol ?? rawOrder.quote_currency?.code
    ),
    orderType: clean(rawOrder.order_type),
    timeInForce: clean(rawOrder.time_in_force),
    timePlaced: dateValue(rawOrder.time_placed),
    timeUpdated: dateValue(rawOrder.time_updated),
    timeExecuted: dateValue(rawOrder.time_executed),
    expiryDate: dateValue(rawOrder.expiry_date),
    syncedAt: new Date(),
  };
}
