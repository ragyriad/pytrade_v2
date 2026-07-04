import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  securityPriceSnapshots,
  type NewSecurityPriceSnapshot,
  type SecurityPriceSnapshot,
} from "../schemas/security_price_snapshots_schema.js";

export async function upsertSecurityPriceSnapshots(
  db: DB,
  data: NewSecurityPriceSnapshot[]
): Promise<SecurityPriceSnapshot[]> {
  if (data.length === 0) return [];

  return db
    .insert(securityPriceSnapshots)
    .values(data)
    .onConflictDoUpdate({
      target: [
        securityPriceSnapshots.source,
        securityPriceSnapshots.providerTicker,
        securityPriceSnapshots.priceDate,
      ],
      set: {
        securityId: sql`excluded.security_id`,
        symbol: sql`excluded.symbol`,
        currencyCode: sql`excluded.currency_code`,
        open: sql`excluded.open`,
        high: sql`excluded.high`,
        low: sql`excluded.low`,
        close: sql`excluded.close`,
        adjustedClose: sql`excluded.adjusted_close`,
        volume: sql`excluded.volume`,
        rawData: sql`excluded.raw_data`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}

export async function getLatestSecurityPriceSnapshots(
  db: DB,
  securityIds: string[],
  options: { source?: string } = {}
): Promise<SecurityPriceSnapshot[]> {
  if (securityIds.length === 0) return [];

  const rows = await db
    .select()
    .from(securityPriceSnapshots)
    .where(
      options.source
        ? and(
            inArray(securityPriceSnapshots.securityId, securityIds),
            eq(securityPriceSnapshots.source, options.source)
          )
        : inArray(securityPriceSnapshots.securityId, securityIds)
    )
    .orderBy(
      securityPriceSnapshots.securityId,
      desc(securityPriceSnapshots.priceDate)
    );

  const latestBySecurityId = new Map<string, SecurityPriceSnapshot>();

  for (const row of rows) {
    if (!latestBySecurityId.has(row.securityId)) {
      latestBySecurityId.set(row.securityId, row);
    }
  }

  return [...latestBySecurityId.values()];
}

export async function getSecurityPriceSnapshotsBySecurity(
  db: DB,
  securityId: string
): Promise<SecurityPriceSnapshot[]> {
  return db
    .select()
    .from(securityPriceSnapshots)
    .where(eq(securityPriceSnapshots.securityId, securityId))
    .orderBy(desc(securityPriceSnapshots.priceDate));
}
