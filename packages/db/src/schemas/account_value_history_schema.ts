import {
  date,
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

/**
 * Daily total account valuations supplied by a brokerage. Unlike
 * account_balances, this is an append/upsert history used for performance
 * measurement. SnapTrade currently supplies at most one year of estimates.
 */
export const accountValueHistory = pgTable(
  "account_value_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    valueDate: date("value_date").notNull(),
    totalValue: numeric("total_value", { precision: 24, scale: 8 }).notNull(),
    currencyCode: varchar("currency_code", { length: 10 }).notNull(),
    source: varchar("source", { length: 50 }).notNull().default("SNAPTRADE"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("account_value_history_account_date_idx").on(
      table.accountId,
      table.valueDate
    ),
    index("account_value_history_account_idx").on(table.accountId),
    index("account_value_history_date_idx").on(table.valueDate),
  ]
);

export type AccountValueHistory = typeof accountValueHistory.$inferSelect;
export type NewAccountValueHistory = typeof accountValueHistory.$inferInsert;
