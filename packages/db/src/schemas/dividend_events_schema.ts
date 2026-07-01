import {
  boolean,
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

export const dividendEvents = pgTable(
  "dividend_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    securityId: uuid("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),

    source: varchar("source", { length: 50 }).notNull(),
    sourceEventId: varchar("source_event_id", { length: 255 }).notNull(),
    providerTicker: varchar("provider_ticker", { length: 50 }).notNull(),
    symbol: varchar("symbol", { length: 50 }).notNull(),

    currencyCode: varchar("currency_code", { length: 10 }),
    cashAmount: numeric("cash_amount", { precision: 18, scale: 6 }).notNull(),

    exDate: date("ex_date").notNull(),
    paymentDate: date("payment_date"),
    recordDate: date("record_date"),
    declarationDate: date("declaration_date"),

    frequency: varchar("frequency", { length: 20 }),
    distributionType: varchar("distribution_type", { length: 50 }),
    isSpecial: boolean("is_special").notNull().default(false),
    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("dividend_events_source_event_idx").on(
      table.source,
      table.sourceEventId
    ),
    index("dividend_events_security_idx").on(table.securityId),
    index("dividend_events_symbol_idx").on(table.symbol),
    index("dividend_events_provider_ticker_idx").on(table.providerTicker),
    index("dividend_events_ex_date_idx").on(table.exDate),
  ]
);

export type DividendEvent = typeof dividendEvents.$inferSelect;
export type NewDividendEvent = typeof dividendEvents.$inferInsert;
