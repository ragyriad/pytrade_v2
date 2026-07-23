import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
  pgEnum
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const statusEnum = pgEnum("status", [
  "active",
  "inactive",
  "deactivated",
  "error",
  "open",
  "closed"
]);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    // brokerage info
    snaptradeAccountId: uuid("snaptrade_account_id").unique(),
    brokerageAuthorization: varchar("brokerage_authorization" , { length: 255 }),
    brokerageAccountNumber: varchar("brokerage_account_number" , { length: 255 }).unique(),
    brokerageName: varchar("brokerage_name", { length: 255 }),
    // account info
    accountCurrency: varchar("account_currency", { length: 10 }),
    status: statusEnum().default("active"),
    type: varchar("type", { length: 100 }),
    rawType: varchar("raw_type", { length: 100 }),
    snaptradeMetaType: varchar("snaptrade_meta_type", { length: 100 }),
    snaptradeUnifiedAccountType: varchar("snaptrade_unified_account_type", {
      length: 100,
    }),
    name: varchar("name", { length: 255 }),
    isPaper: boolean("is_paper").default(false),
    isArchived: boolean("is_archived").notNull().default(false),
    linkedAccountId: varchar("linked_account_id", { length: 255 }),
    balanceAmount: numeric("balance_amount", { precision: 18, scale: 2 }),
    balanceCurrency: varchar("balance_currency", { length: 10 }),
    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),
    //sync fields
    openingDate: timestamp("opening_date", {
      withTimezone: true,
      mode: "date",
    }),
    fundingDate: timestamp("funding_date", {
      withTimezone: true,
      mode: "date",
    }),
    firstTransactionDate: timestamp("first_transaction_date", {
      withTimezone: true,
      mode: "date",
    }),
    lastTransactionsSyncAt: timestamp("last_transactions_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    lastHoldingsSyncAt: timestamp("last_holdings_sync_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "date",
    })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "date",
    })
      .default(sql`now()`)
      .$onUpdate(() => new Date())
      .notNull(),
      },
  (table) => [
    index("accounts_user_idx").on(table.userId),
    uniqueIndex("brokerage_account_number_idx").on(table.brokerageAccountNumber),
    index("linked_account_idx").on(table.linkedAccountId),
    index("account_type_idx").on(table.type),
    index("accounts_is_archived_idx").on(table.isArchived),
  ]
);

export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;

export type AccountSummary = Pick<
  Account,
  | "id"
  | "userId"
  | "status"
  | "brokerageAccountNumber"
  | "name"
  | "type"
  | "balanceAmount"
  | "balanceCurrency"
  | "firstTransactionDate"
>;
