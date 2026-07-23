import {
  boolean,
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const securities = pgTable(
  "securities",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Stable application key. Prefer SnapTrade id, then FIGI, then symbol + exchange.
    securityKey: varchar("security_key", { length: 350 }).notNull(),
    source: varchar("source", { length: 50 }).notNull().default("SNAPTRADE"),
    isArchived: boolean("is_archived").notNull().default(false),

    // SnapTrade can be missing symbol ids on some activity rows, so this stays nullable.
    snaptradeSymbolId: varchar("snaptrade_symbol_id", { length: 255 }),

    symbol: varchar("symbol", { length: 50 }).notNull(),
    rawSymbol: varchar("raw_symbol", { length: 50 }),
    description: text("description"),
    currencyCode: varchar("currency_code", { length: 10 }),

    exchangeCode: varchar("exchange_code", { length: 20 }),
    exchangeMicCode: varchar("exchange_mic_code", { length: 10 }),
    exchangeName: varchar("exchange_name", { length: 255 }),

    instrumentTypeCode: varchar("instrument_type_code", { length: 10 }),
    instrumentTypeDescription: varchar("instrument_type_description", {
      length: 100,
    }),

    figiCode: varchar("figi_code", { length: 20 }),
    figiInstrumentCode: varchar("figi_instrument_code", { length: 20 }),
    logoUrl: varchar("logo_url", { length: 500 }),

    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("securities_security_key_idx").on(table.securityKey),
    index("securities_snaptrade_symbol_idx").on(table.snaptradeSymbolId),
    index("securities_symbol_idx").on(table.symbol),
    index("securities_source_idx").on(table.source),
    index("securities_figi_idx").on(table.figiCode),
    index("securities_is_archived_idx").on(table.isArchived),
  ]
);

export type Security = typeof securities.$inferSelect;
export type NewSecurity = typeof securities.$inferInsert;
