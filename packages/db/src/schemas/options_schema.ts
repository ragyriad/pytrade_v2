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

export const options = pgTable(
  "options",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),
    underlyingSecurityId: uuid("underlying_security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "restrict" }),

    ticker: varchar("ticker", { length: 80 }).notNull(),
    contractType: varchar("contract_type", { length: 10 }).notNull(),
    strikePrice: numeric("strike_price", { precision: 18, scale: 6 }).notNull(),
    expirationDate: date("expiration_date").notNull(),
    multiplier: numeric("multiplier", { precision: 10, scale: 2 })
      .notNull()
      .default("100"),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    isMiniOption: boolean("is_mini_option").notNull().default(false),
    isArchived: boolean("is_archived").notNull().default(false),

    rawData: jsonb("raw_data").$type<Record<string, unknown> | null>(),

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
    uniqueIndex("options_security_idx").on(table.securityId),
    uniqueIndex("options_ticker_idx").on(table.ticker),
    index("options_underlying_idx").on(table.underlyingSecurityId),
    index("options_status_idx").on(table.status),
    index("options_expiration_idx").on(table.expirationDate),
    index("options_is_archived_idx").on(table.isArchived),
  ]
);

export type Option = typeof options.$inferSelect;
export type NewOption = typeof options.$inferInsert;
