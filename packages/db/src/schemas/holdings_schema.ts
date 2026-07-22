import { sql } from "drizzle-orm";
import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { accounts } from "./accounts_schema.js";
import { securities } from "./securities_schema.js";

const amount = (name: string) => numeric(name, { precision: 24, scale: 2 });

// Historical holdings reported by a brokerage at a specific effective date.
// Current/live holdings remain in `positions`; this table is append-only history.
export const holdings = pgTable(
  "holdings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    securityId: uuid("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),
    underlyingSecurityId: uuid("underlying_security_id").references(
      () => securities.id,
      { onDelete: "set null" }
    ),

    importKey: varchar("import_key", { length: 64 }).notNull(),
    source: varchar("source", { length: 50 }).notNull(),
    sourceFile: text("source_file").notNull(),
    sourcePage: integer("source_page").notNull(),
    asOfDate: date("as_of_date").notNull(),

    category: varchar("category", { length: 20 }).notNull(),
    currencyCode: varchar("currency_code", { length: 10 }).notNull(),
    optionType: varchar("option_type", { length: 10 }),
    rawSymbol: varchar("raw_symbol", { length: 100 }).notNull(),
    symbol: varchar("symbol", { length: 100 }).notNull(),
    description: text("description"),
    costBasis: varchar("cost_basis", { length: 20 }),

    quantity: amount("quantity"),
    positionCost: amount("position_cost"),
    marketPrice: amount("market_price"),
    marketValue: amount("market_value"),

    importedAt: timestamp("imported_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("holdings_import_key_idx").on(table.importKey),
    index("holdings_account_date_idx").on(table.accountId, table.asOfDate),
    index("historical_holdings_security_idx").on(table.securityId),
    index("historical_holdings_underlying_security_idx").on(table.underlyingSecurityId),
    index("historical_holdings_symbol_idx").on(table.symbol),
  ]
);

export type Holding = typeof holdings.$inferSelect;
export type NewHolding = typeof holdings.$inferInsert;
