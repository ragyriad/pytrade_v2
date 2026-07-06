import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  forexRateSnapshots,
  type ForexRateSnapshot,
  type NewForexRateSnapshot,
} from "../schemas/forex_rate_snapshots_schema.js";

export async function upsertForexRateSnapshots(
  db: DB,
  data: NewForexRateSnapshot[]
): Promise<ForexRateSnapshot[]> {
  if (data.length === 0) return [];

  return db
    .insert(forexRateSnapshots)
    .values(data)
    .onConflictDoUpdate({
      target: [
        forexRateSnapshots.source,
        forexRateSnapshots.providerTicker,
        forexRateSnapshots.rateDate,
      ],
      set: {
        baseCurrency: sql`excluded.base_currency`,
        quoteCurrency: sql`excluded.quote_currency`,
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        adjustedClose: sql`excluded.adjusted_close`,
        rawData: sql`excluded.raw_data`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}

export async function getLatestForexRateSnapshots(
  db: DB,
  providerTickers: string[] = [],
  options: { source?: string } = {}
): Promise<ForexRateSnapshot[]> {
  const rows = await db
    .select()
    .from(forexRateSnapshots)
    .where(
      providerTickers.length > 0 && options.source
        ? and(
            inArray(forexRateSnapshots.providerTicker, providerTickers),
            eq(forexRateSnapshots.source, options.source)
          )
        : providerTickers.length > 0
          ? inArray(forexRateSnapshots.providerTicker, providerTickers)
          : options.source
            ? eq(forexRateSnapshots.source, options.source)
            : undefined
    )
    .orderBy(
      forexRateSnapshots.providerTicker,
      desc(forexRateSnapshots.rateDate)
    );

  const latestByTicker = new Map<string, ForexRateSnapshot>();

  for (const row of rows) {
    if (!latestByTicker.has(row.providerTicker)) {
      latestByTicker.set(row.providerTicker, row);
    }
  }

  return [...latestByTicker.values()];
}
