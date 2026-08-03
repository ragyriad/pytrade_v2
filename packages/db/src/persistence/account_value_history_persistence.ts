import { asc, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  accountValueHistory,
  type AccountValueHistory,
  type NewAccountValueHistory,
} from "../schemas/account_value_history_schema.js";

export async function upsertAccountValueHistory(
  db: DB,
  accountId: string,
  data: NewAccountValueHistory[]
): Promise<void> {
  if (data.some((value) => value.accountId !== accountId)) {
    throw new Error(`Cannot sync value history from another account into ${accountId}`);
  }

  const byDate = new Map(data.map((value) => [value.valueDate, value]));
  const valuesToSync = [...byDate.values()];
  if (valuesToSync.length === 0) return;

  await db
    .insert(accountValueHistory)
    .values(valuesToSync)
    .onConflictDoUpdate({
      target: [accountValueHistory.accountId, accountValueHistory.valueDate],
      set: {
        totalValue: sql`excluded.total_value`,
        currencyCode: sql`excluded.currency_code`,
        source: sql`excluded.source`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

export async function getAccountValueHistoryByAccounts(
  db: DB,
  accountIds: string[]
): Promise<AccountValueHistory[]> {
  if (accountIds.length === 0) return [];

  return db
    .select()
    .from(accountValueHistory)
    .where(inArray(accountValueHistory.accountId, accountIds))
    .orderBy(asc(accountValueHistory.valueDate), asc(accountValueHistory.accountId));
}

export async function getAccountValueHistoryByAccount(
  db: DB,
  accountId: string
): Promise<AccountValueHistory[]> {
  return db
    .select()
    .from(accountValueHistory)
    .where(eq(accountValueHistory.accountId, accountId))
    .orderBy(asc(accountValueHistory.valueDate));
}
