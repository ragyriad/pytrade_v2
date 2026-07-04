import {
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { securities } from "./securities_schema.js";

export const securityPriceSnapshots = pgTable(
  "security_price_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),

    source: varchar("source", { length: 50 }).notNull(),
    providerTicker: varchar("provider_ticker", { length: 50 }).notNull(),
    symbol: varchar("symbol", { length: 50 }).notNull(),
    currencyCode: varchar("currency_code", { length: 10 }),

    priceDate: date("price_date").notNull(),
    open: numeric("open", { precision: 18, scale: 6 }),
    high: numeric("high", { precision: 18, scale: 6 }),
    low: numeric("low", { precision: 18, scale: 6 }),
    close: numeric("close", { precision: 18, scale: 6 }).notNull(),
    adjustedClose: numeric("adjusted_close", { precision: 18, scale: 6 }),
    volume: numeric("volume", { precision: 24, scale: 6 }),

    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("security_price_snapshots_source_ticker_date_idx").on(
      table.source,
      table.providerTicker,
      table.priceDate
    ),
    index("security_price_snapshots_security_date_idx").on(
      table.securityId,
      table.priceDate
    ),
    index("security_price_snapshots_symbol_idx").on(table.symbol),
  ]
);

export type SecurityPriceSnapshot = typeof securityPriceSnapshots.$inferSelect;
export type NewSecurityPriceSnapshot = typeof securityPriceSnapshots.$inferInsert;
