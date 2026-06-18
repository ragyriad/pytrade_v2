import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  pgEnum
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";

export const transactionTypeEnum = pgEnum("type", [
  "BUY",
  "SELL",
  "DIVIDEND",
  "INTEREST",
  "DEPOSIT",
  "WITHDRAWAL",
  "FEE",
  "OTHER",
  "CONTRIBUTION",
  "P2P_PAYMENT"
]);

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    snaptradeTransactionId: varchar("snaptrade_transaction_id", {
      length: 36,
    })
      .notNull()
      .unique(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    type: varchar("type", { length: 200 }).notNull(),
    description: text("description"),

    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    price: numeric("price", { precision: 18, scale: 6 }),
    units: numeric("units", { precision: 18, scale: 6 }),

    fee: numeric("fee", { precision: 10, scale: 4 })
      .notNull()
      .default("0"),

    currencyCode: varchar("currency_code", { length: 3 }),
    symbol: varchar("symbol", { length: 20 }),

    tradeDate: timestamp("trade_date", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    index("transactions_account_idx").on(table.accountId),
    index("transactions_trade_date_idx").on(table.tradeDate),
]
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;