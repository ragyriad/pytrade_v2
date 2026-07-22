import {
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";

// Current cash balance for one account/currency. This is reconciled in place
// on sync and is not a history table.
export const accountBalances = pgTable(
  "account_balances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    currencyCode: varchar("currency_code", { length: 10 }).notNull(),
    cash: numeric("cash", { precision: 24, scale: 8 }),
    buyingPower: numeric("buying_power", { precision: 24, scale: 8 }),
    source: varchar("source", { length: 50 }).notNull().default("SNAPTRADE"),
    sourceFile: text("source_file"),
    asOfDate: date("as_of_date"),
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("account_balances_account_currency_idx").on(
      table.accountId,
      table.currencyCode
    ),
    index("account_balances_account_idx").on(table.accountId),
  ]
);

export type AccountBalance = typeof accountBalances.$inferSelect;
export type NewAccountBalance = typeof accountBalances.$inferInsert;
