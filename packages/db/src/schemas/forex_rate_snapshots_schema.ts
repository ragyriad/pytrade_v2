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

export const forexRateSnapshots = pgTable(
  "forex_rate_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    source: varchar("source", { length: 50 }).notNull(),
    providerTicker: varchar("provider_ticker", { length: 50 }).notNull(),
    baseCurrency: varchar("base_currency", { length: 10 }).notNull(),
    quoteCurrency: varchar("quote_currency", { length: 10 }).notNull(),

    rateDate: date("rate_date").notNull(),
    open: numeric("open", { precision: 18, scale: 8 }),
    high: numeric("high", { precision: 18, scale: 8 }),
    low: numeric("low", { precision: 18, scale: 8 }),
    close: numeric("close", { precision: 18, scale: 8 }).notNull(),
    adjustedClose: numeric("adjusted_close", { precision: 18, scale: 8 }),

    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("forex_rate_snapshots_source_ticker_date_idx").on(
      table.source,
      table.providerTicker,
      table.rateDate
    ),
    index("forex_rate_snapshots_pair_date_idx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.rateDate
    ),
  ]
);

export type ForexRateSnapshot = typeof forexRateSnapshots.$inferSelect;
export type NewForexRateSnapshot = typeof forexRateSnapshots.$inferInsert;
