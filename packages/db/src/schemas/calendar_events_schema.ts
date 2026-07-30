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

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    securityId: uuid("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),

    eventType: varchar("event_type", { length: 50 }).notNull(),
    eventDate: date("event_date").notNull(),
    eventName: varchar("event_name", { length: 255 }),
    eventStatus: varchar("event_status", { length: 50 }),
    isEstimated: boolean("is_estimated").notNull().default(false),

    providerSource: varchar("provider_source", { length: 50 }).notNull(),
    providerEventId: varchar("provider_event_id", { length: 255 }).notNull(),
    canonicalKey: varchar("canonical_key", { length: 500 }).notNull(),
    providerTicker: varchar("provider_ticker", { length: 50 }).notNull(),
    symbol: varchar("symbol", { length: 50 }).notNull(),

    currencyCode: varchar("currency_code", { length: 10 }),

    cashAmount: numeric("cash_amount", { precision: 18, scale: 6 }),
    exDate: date("ex_date"),
    paymentDate: date("payment_date"),
    recordDate: date("record_date"),
    declarationDate: date("declaration_date"),
    frequency: varchar("frequency", { length: 20 }),
    distributionType: varchar("distribution_type", { length: 50 }),
    isSpecial: boolean("is_special").notNull().default(false),

    fiscalDateEnding: date("fiscal_date_ending"),
    estimatedEps: numeric("estimated_eps", { precision: 18, scale: 6 }),
    reportedEps: numeric("reported_eps", { precision: 18, scale: 6 }),

    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("calendar_events_provider_event_idx").on(
      table.providerSource,
      table.providerEventId
    ),
    uniqueIndex("calendar_events_canonical_key_idx").on(table.canonicalKey),
    index("calendar_events_security_idx").on(table.securityId),
    index("calendar_events_symbol_idx").on(table.symbol),
    index("calendar_events_provider_ticker_idx").on(table.providerTicker),
    index("calendar_events_type_date_idx").on(table.eventType, table.eventDate),
    index("calendar_events_ex_date_idx").on(table.exDate),
  ]
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type NewCalendarEvent = typeof calendarEvents.$inferInsert;

// Kept as compatibility aliases for the dividend-specific services.
export type DividendEvent = CalendarEvent;
export type NewDividendEvent = NewCalendarEvent;
