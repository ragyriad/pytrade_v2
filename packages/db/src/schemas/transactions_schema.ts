import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  timestamp,
  index,
  uniqueIndex,
  pgEnum,
  boolean
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";
import { securities } from "./securities_schema.js";

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
      .unique(),

    source: varchar("source", { length: 50 }).notNull().default("SNAPTRADE"),
    externalTransactionId: varchar("external_transaction_id", { length: 255 }),
    legacyImportKey: varchar("legacy_import_key", { length: 500 }),
    isArchived: boolean("is_archived").notNull().default(false),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),

    securityId: uuid("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),

    type: varchar("type", { length: 200 }).notNull(),
    action: varchar("action", { length: 50 }),
    assetType: varchar("asset_type", { length: 50 }),
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
    index("transactions_security_idx").on(table.securityId),
    index("transactions_trade_date_idx").on(table.tradeDate),
    index("transactions_symbol_idx").on(table.symbol),
    index("transactions_action_idx").on(table.action),
    index("transactions_asset_type_idx").on(table.assetType),
    index("transactions_is_archived_idx").on(table.isArchived),
    index("transactions_source_external_idx").on(
      table.source,
      table.externalTransactionId
    ),
    uniqueIndex("transactions_legacy_import_key_idx").on(table.legacyImportKey),
]
);

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
