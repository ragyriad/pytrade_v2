import {
  pgTable,
  uuid,
  varchar,
  numeric,
  boolean,
  timestamp,
  index,
  text,
} from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";
import { securities } from "./securities_schema.js";

// ---------------------------------------------------------------------------
// positions
// One row per position held in an account at the time of the last sync.
// This is a current-state snapshot table. Rows are reconciled in place on each
// holdings sync; there is no history here. Historical holdings belong in a
// separate holdings_snapshots table if needed later.
// ---------------------------------------------------------------------------

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    securityId: uuid("security_id").references(() => securities.id, {
      onDelete: "set null",
    }),

    snaptradeSymbolId: varchar("snaptrade_symbol_id", { length: 255 }),
    snaptradeInstrumentId: varchar("snaptrade_instrument_id", { length: 255 }),

    // Ticker as displayed (e.g. "AAPL", "BQ.WV", "TDT.GD")
    symbol: varchar("symbol", { length: 50 }).notNull(),
    description: text("description"),
    // Raw/underlying symbol when the display symbol has an exchange suffix
    rawSymbol: varchar("raw_symbol", { length: 50 }),
    // Exchange identifiers — kept for display and potential routing logic
    exchangeCode: varchar("exchange_code", { length: 20 }),
    exchangeMicCode: varchar("exchange_mic_code", { length: 10 }),
    exchangeName: varchar("exchange_name", { length: 255 }),
    units: numeric("units", { precision: 18, scale: 6 }).notNull(),
    fractionalUnits: numeric("fractional_units", { precision: 18, scale: 6 }),
    price: numeric("price", { precision: 18, scale: 6 }),
    averagePurchasePrice: numeric("average_purchase_price", {
      precision: 18,
      scale: 6,
    }),
    openPnl: numeric("open_pnl", { precision: 18, scale: 6 }),
    currencyCode: varchar("currency_code", { length: 10 }),

    // ------------------------------------------------------------------
    // Flags
    // cashEquivalent — true for money market funds, cash positions, etc.
    //   Kept because the UI should render these differently (no price
    //   chart, no P&L display).
    // isQuotable / isTradable — sourced from the symbol wrapper.
    //   Useful for disabling trade actions in the UI without an extra
    //   API call.
    // ------------------------------------------------------------------
    cashEquivalent: boolean("cash_equivalent").default(false),
    isQuotable: boolean("is_quotable").default(false),
    isTradable: boolean("is_tradable").default(false),

    // ------------------------------------------------------------------
    // Asset classification
    // instrumentTypeCode — short code from symbol.symbol.type (e.g. "eq")
    // instrumentTypeDescription — human label (e.g. "Common Stock")
    // Kept flat here rather than a separate lookup table because these
    // codes are SnapTrade-defined and unlikely to be queried in bulk.
    // ------------------------------------------------------------------
    instrumentTypeCode: varchar("instrument_type_code", { length: 10 }),
    instrumentTypeDescription: varchar("instrument_type_description", {
      length: 100,
    }),

    // FIGI codes — globally unique instrument identifiers.
    // Kept because they are the standard cross-broker instrument key
    figiCode: varchar("figi_code", { length: 20 }),
    figiInstrumentCode: varchar("figi_instrument_code", { length: 20 }),
    // Logo URL for the instrument — used directly in the UI
    logoUrl: varchar("logo_url", { length: 500 }),
    // Sync timestamp — when this snapshot was last written
    syncedAt: timestamp("synced_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (table) => [
    // Primary access pattern: all holdings for an account
    index("holdings_account_idx").on(table.accountId),
    // Look up a specific position by ticker within an account
    index("holdings_account_symbol_idx").on(table.accountId, table.symbol),
    // Cross-account queries by instrument (e.g. "how much AAPL do I hold total")
    index("holdings_symbol_idx").on(table.symbol),
    index("holdings_security_idx").on(table.securityId),
    // FIGI-based joins against market data providers
    index("holdings_figi_idx").on(table.figiCode),
  ]
);



export const positionsRelations = defineRelations(
  { positions, accounts, securities },
  (r) => ({
    positions: {
      account: r.one.accounts({
        from: r.positions.accountId,
        to: r.accounts.id,
      }),
      security: r.one.securities({
        from: r.positions.securityId,
        to: r.securities.id,
        optional: true,
      }),
    },
  })
);

export type Position = typeof positions.$inferSelect;
export type NewPosition = typeof positions.$inferInsert;
