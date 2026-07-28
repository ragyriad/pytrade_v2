import { eq, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  accountBalances,
  type AccountBalance,
  type NewAccountBalance,
} from "../schemas/account_balances_schema.js";

/**
 * Upserts balance snapshots by account + currency. A partial or empty provider
 * response never deletes an existing balance row.
 */
export async function upsertAccountBalances(
  db: DB,
  accountId: string,
  data: NewAccountBalance[]
): Promise<void> {
  if (data.some((balance) => balance.accountId !== accountId)) {
    throw new Error(`Cannot sync balances from another account into ${accountId}`);
  }

  const byCurrency = new Map(
    data.map((balance) => [balance.currencyCode, balance])
  );
  const balancesToSync = [...byCurrency.values()];
  if (balancesToSync.length === 0) return;

  await db
    .insert(accountBalances)
    .values(balancesToSync)
    .onConflictDoUpdate({
      target: [accountBalances.accountId, accountBalances.currencyCode],
      set: {
        cash: sql`excluded.cash`,
        buyingPower: sql`excluded.buying_power`,
        source: sql`excluded.source`,
        sourceFile: sql`excluded.source_file`,
        asOfDate: sql`excluded.as_of_date`,
        syncedAt: sql`excluded.synced_at`,
      },
    });
}

/** @deprecated Use upsertAccountBalances. */
export const reconcileAccountBalances = upsertAccountBalances;

/** @deprecated Use upsertAccountBalances. */
export const replaceAccountBalances = upsertAccountBalances;

export async function getBalancesByAccount(
  db: DB,
  accountId: string
): Promise<AccountBalance[]> {
  return db
    .select()
    .from(accountBalances)
    .where(eq(accountBalances.accountId, accountId));
}
