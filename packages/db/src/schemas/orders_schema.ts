import {
  index,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";
import { securities } from "./securities_schema.js";

// Brokerage orders returned by SnapTrade. The API has a bounded lookback, so
// rows are retained and updated by brokerage order id rather than replaced.
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    securityId: uuid("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),

    brokerageOrderId: varchar("brokerage_order_id", { length: 255 }).notNull(),
    brokerageGroupOrderId: varchar("brokerage_group_order_id", { length: 255 }),
    orderRole: varchar("order_role", { length: 50 }),
    status: varchar("status", { length: 40 }).notNull(),
    action: varchar("action", { length: 40 }),

    totalQuantity: numeric("total_quantity", { precision: 24, scale: 8 }),
    openQuantity: numeric("open_quantity", { precision: 24, scale: 8 }),
    filledQuantity: numeric("filled_quantity", { precision: 24, scale: 8 }),
    executionPrice: numeric("execution_price", { precision: 24, scale: 8 }),
    limitPrice: numeric("limit_price", { precision: 24, scale: 8 }),
    stopPrice: numeric("stop_price", { precision: 24, scale: 8 }),
    trailingStopAmount: numeric("trailing_stop_amount", {
      precision: 24,
      scale: 8,
    }),
    trailingStopType: varchar("trailing_stop_type", { length: 10 }),
    quoteSymbol: varchar("quote_symbol", { length: 50 }),
    orderType: varchar("order_type", { length: 50 }),
    timeInForce: varchar("time_in_force", { length: 30 }),

    timePlaced: timestamp("time_placed", { withTimezone: true }),
    timeUpdated: timestamp("time_updated", { withTimezone: true }),
    timeExecuted: timestamp("time_executed", { withTimezone: true }),
    expiryDate: timestamp("expiry_date", { withTimezone: true }),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("orders_account_brokerage_order_idx").on(
      table.accountId,
      table.brokerageOrderId
    ),
    index("orders_account_idx").on(table.accountId),
    index("orders_security_idx").on(table.securityId),
    index("orders_account_status_idx").on(table.accountId, table.status),
  ]
);

export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
