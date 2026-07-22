import { desc, eq, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import { orders, type NewOrder, type Order } from "../schemas/orders_schema.js";

/**
 * Upserts the bounded recent-orders response by the brokerage's stable order
 * id. Older orders are retained because SnapTrade's `days` parameter means an
 * absent order is not evidence that it was deleted.
 */
export async function upsertAccountOrders(
  db: DB,
  accountId: string,
  data: NewOrder[]
): Promise<void> {
  if (data.length === 0) return;
  if (data.some((order) => order.accountId !== accountId)) {
    throw new Error(`Cannot sync orders from another account into ${accountId}`);
  }

  const byBrokerageOrderId = new Map(
    data.map((order) => [order.brokerageOrderId, order])
  );
  await db
    .insert(orders)
    .values([...byBrokerageOrderId.values()])
    .onConflictDoUpdate({
      target: [orders.accountId, orders.brokerageOrderId],
      set: {
        securityId: sql`excluded.security_id`,
        brokerageGroupOrderId: sql`excluded.brokerage_group_order_id`,
        orderRole: sql`excluded.order_role`,
        status: sql`excluded.status`,
        action: sql`excluded.action`,
        totalQuantity: sql`excluded.total_quantity`,
        openQuantity: sql`excluded.open_quantity`,
        filledQuantity: sql`excluded.filled_quantity`,
        executionPrice: sql`excluded.execution_price`,
        limitPrice: sql`excluded.limit_price`,
        stopPrice: sql`excluded.stop_price`,
        trailingStopAmount: sql`excluded.trailing_stop_amount`,
        trailingStopType: sql`excluded.trailing_stop_type`,
        quoteSymbol: sql`excluded.quote_symbol`,
        orderType: sql`excluded.order_type`,
        timeInForce: sql`excluded.time_in_force`,
        timePlaced: sql`excluded.time_placed`,
        timeUpdated: sql`excluded.time_updated`,
        timeExecuted: sql`excluded.time_executed`,
        expiryDate: sql`excluded.expiry_date`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/** @deprecated Use upsertAccountOrders. */
export const replaceAccountOrders = upsertAccountOrders;

export async function getOrdersByAccount(
  db: DB,
  accountId: string
): Promise<Order[]> {
  return db
    .select()
    .from(orders)
    .where(eq(orders.accountId, accountId))
    .orderBy(desc(orders.timePlaced));
}
