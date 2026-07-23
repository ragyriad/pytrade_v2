import {
  boolean,
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { securities } from "./securities_schema.js";

export const securityAliases = pgTable(
  "security_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    securityId: uuid("security_id")
      .notNull()
      .references(() => securities.id, { onDelete: "cascade" }),

    source: varchar("source", { length: 100 }).notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    externalId: varchar("external_id", { length: 255 }),
    symbol: varchar("symbol", { length: 50 }).notNull(),
    rawSymbol: varchar("raw_symbol", { length: 50 }),
    currencyCode: varchar("currency_code", { length: 10 }),
    exchangeCode: varchar("exchange_code", { length: 20 }),
    exchangeMicCode: varchar("exchange_mic_code", { length: 10 }),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    uniqueIndex("security_aliases_source_external_idx").on(
      table.source,
      table.externalId
    ),
    uniqueIndex("security_aliases_source_symbol_idx").on(
      table.source,
      table.symbol,
      table.currencyCode,
      table.exchangeCode
    ),
    index("security_aliases_security_idx").on(table.securityId),
    index("security_aliases_symbol_idx").on(table.symbol),
    index("security_aliases_is_archived_idx").on(table.isArchived),
  ]
);

export type SecurityAlias = typeof securityAliases.$inferSelect;
export type NewSecurityAlias = typeof securityAliases.$inferInsert;
