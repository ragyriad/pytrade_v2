import { and, eq, notInArray, sql } from "drizzle-orm";
import type { DB } from "../db_type.js";
import {
  accountBalances,
  type AccountBalance,
  type NewAccountBalance,
} from "../schemas/account_balances_schema.js";

/**
 * Reconciles the current balance snapshot by account + currency. Existing
 * rows retain their ids; currencies no longer returned by SnapTrade are the
 * only rows removed.
 */
export async function reconcileAccountBalances(
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
  const currencies = [...byCurrency.keys()];

  await db.transaction(async (tx) => {
    if (balancesToSync.length > 0) {
      await tx
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
      await tx
        .delete(accountBalances)
        .where(
          and(
            eq(accountBalances.accountId, accountId),
            notInArray(accountBalances.currencyCode, currencies)
          )
        );
      return;
    }

    await tx.delete(accountBalances).where(eq(accountBalances.accountId, accountId));
  });
}

/** @deprecated Use reconcileAccountBalances. */
export const replaceAccountBalances = reconcileAccountBalances;

export async function getBalancesByAccount(
  db: DB,
  accountId: string
): Promise<AccountBalance[]> {
  return db
    .select()
    .from(accountBalances)
    .where(eq(accountBalances.accountId, accountId));
}
