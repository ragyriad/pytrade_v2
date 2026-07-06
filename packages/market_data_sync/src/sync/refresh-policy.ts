import {
  and,
  db,
  dividendEvents,
  eq,
  forexRateSnapshots,
  inArray,
  securityPriceSnapshots,
  sql,
} from "@repo/db";
import type { DB } from "@repo/db";

type RefreshRow = {
  securityId: string | null;
  latestUpdatedAt: Date | string | null;
};

export function shouldRefresh(
  latestUpdatedAt: Date | string | null | undefined,
  refreshAfterDays: number,
  force: boolean
): boolean {
  if (force || !latestUpdatedAt) return true;

  const latest = new Date(latestUpdatedAt);
  const nextRefreshAt = new Date(latest);
  nextRefreshAt.setUTCDate(nextRefreshAt.getUTCDate() + refreshAfterDays);

  return nextRefreshAt <= new Date();
}

export async function getDividendRefreshState(
  securityIds: string[],
  source: string,
  database: DB = db
): Promise<Map<string, Date | string | null>> {
  if (securityIds.length === 0) return new Map();

  const rows = await database
    .select({
      securityId: dividendEvents.securityId,
      latestUpdatedAt: sql<Date>`max(${dividendEvents.updatedAt})`,
    })
    .from(dividendEvents)
    .where(
      and(
        inArray(dividendEvents.securityId, securityIds),
        eq(dividendEvents.source, source)
      )
    )
    .groupBy(dividendEvents.securityId);

  return new Map(
    (rows as RefreshRow[])
      .filter((row) => row.securityId)
      .map((row) => [row.securityId as string, row.latestUpdatedAt])
  );
}

export async function getPriceRefreshState(
  securityIds: string[],
  source: string,
  database: DB = db
): Promise<Map<string, Date | string | null>> {
  if (securityIds.length === 0) return new Map();

  const rows = await database
    .select({
      securityId: securityPriceSnapshots.securityId,
      latestUpdatedAt: sql<Date>`max(${securityPriceSnapshots.updatedAt})`,
    })
    .from(securityPriceSnapshots)
    .where(
      and(
        inArray(securityPriceSnapshots.securityId, securityIds),
        eq(securityPriceSnapshots.source, source)
      )
    )
    .groupBy(securityPriceSnapshots.securityId);

  return new Map(
    (rows as RefreshRow[])
      .filter((row) => row.securityId)
      .map((row) => [row.securityId as string, row.latestUpdatedAt])
  );
}

type ForexRefreshRow = {
  providerTicker: string;
  latestUpdatedAt: Date | string | null;
};

export async function getForexRefreshState(
  providerTickers: string[],
  source: string,
  database: DB = db
): Promise<Map<string, Date | string | null>> {
  if (providerTickers.length === 0) return new Map();

  const rows = await database
    .select({
      providerTicker: forexRateSnapshots.providerTicker,
      latestUpdatedAt: sql<Date>`max(${forexRateSnapshots.updatedAt})`,
    })
    .from(forexRateSnapshots)
    .where(
      and(
        inArray(forexRateSnapshots.providerTicker, providerTickers),
        eq(forexRateSnapshots.source, source)
      )
    )
    .groupBy(forexRateSnapshots.providerTicker);

  return new Map(
    (rows as ForexRefreshRow[]).map((row) => [
      row.providerTicker,
      row.latestUpdatedAt,
    ])
  );
}
