import {
  getSnaptradeBalancesByAccount,
  getSnaptradeOrdersByAccount,
  getSnaptradeTransactionsByAccountId,
  getSnaptradeUserAccounts,
} from "./snaptrade.js";
import { processAccountActivities } from "@repo/snaptrade-activity-processor";
import {
  mapSnaptradeAccount,
  mapSnaptradeBalance,
  getLatestSnaptradeTransactionDate,
  markAccountSynced,
  reconcileAccountBalances,
  reconcileAccountPositions,
  upsertAccountOrders,
  upsertAccount,
} from "@repo/db";
import type { DB } from "@repo/db";
import {getSnaptradePositionsByAccount} from "./snaptrade.js"
import { mapSnaptradePositionsWithSecurities } from "./position_securities.js";
import { mapSnaptradeOrdersWithSecurities } from "./order_securities.js";

export const DEFAULT_SNAPTRADE_ACTIVITY_START_DATE = "2019-01-01";
export const SNAPTRADE_ACTIVITY_OVERLAP_DAYS = 7;

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Uses the newest persisted SnapTrade transaction as a per-account watermark,
 * while re-fetching a short overlap so late corrections are still upserted.
 */
export async function getTransactionSyncStartDate(
  db: DB,
  dbAccountId: string,
  fallbackStartDate = DEFAULT_SNAPTRADE_ACTIVITY_START_DATE,
  overlapDays = SNAPTRADE_ACTIVITY_OVERLAP_DAYS
): Promise<string> {
  const latestTradeDate = await getLatestSnaptradeTransactionDate(
    db,
    dbAccountId
  );
  if (!latestTradeDate) return fallbackStartDate;

  const fallback = new Date(`${fallbackStartDate}T00:00:00.000Z`);
  if (Number.isNaN(fallback.getTime())) {
    throw new Error(`Invalid SnapTrade fallback start date: ${fallbackStartDate}`);
  }

  const overlapStart = new Date(latestTradeDate);
  overlapStart.setUTCDate(overlapStart.getUTCDate() - overlapDays);
  return toDateOnly(
    overlapStart < fallback ? fallback : overlapStart
  );
}

export async function syncTransactionsByAccount(
    db: DB,
    snaptradeAccountId: string,  // SnapTrade's UUID — used to query thedir API
    dbAccountId: string,          // Internal UUID — used as the FK
    accountName: string,
    startDate: string,
    endDate: string,
    accountType?: string | null
  ) {
    const incrementalStartDate = await getTransactionSyncStartDate(
      db,
      dbAccountId,
      startDate
    );
    const rawTransactions = await getSnaptradeTransactionsByAccountId(
      snaptradeAccountId,
      incrementalStartDate,
      endDate
    );

    if (!rawTransactions || rawTransactions.length === 0) {
      console.log(`  No transactions found for account: ${accountName}`);
      await markAccountSynced(db, dbAccountId, { transactions: true });
      return ;
    }

    const result = await processAccountActivities({
      db,
      accountId: dbAccountId,
      accountType,
      providerName: accountName,
      activities: rawTransactions,
    });
    await markAccountSynced(db, dbAccountId, { transactions: true });

    console.log(
      `  Synced ${result.transactionsProcessed} transactions and ${result.securitiesProcessed} securities for account: ${accountName}`
    );
    return result.transactions;
  }

export async function syncAccounts(db: DB, userId: string) {
  const rawAccounts = await getSnaptradeUserAccounts();
  console.log(`Fetched ${rawAccounts.length} accounts from SnapTrade`);

  const mappedAccounts = rawAccounts.map((acc) =>
    mapSnaptradeAccount(acc, userId)
  );

  await db.transaction(async (tx) => {
    for (const acc of mappedAccounts) {
      await upsertAccount(tx, acc);
    }
  });

  console.log(`Synced ${mappedAccounts.length} accounts`);
  return rawAccounts;
}

export async function syncPositionsByAccount(
  db: DB,
  snaptradeAccountId: string,  // SnapTrade's UUID — used to query their API
  dbAccountId: string,          // Our internal UUID — used as the FK
  accountName: string,
) {
  const rawPositions = await getSnaptradePositionsByAccount(snaptradeAccountId);

  const mappedPositions = await mapSnaptradePositionsWithSecurities(
    db,
    rawPositions ?? [],
    dbAccountId
  );

  await reconcileAccountPositions(db, dbAccountId, mappedPositions);
  await markAccountSynced(db, dbAccountId, { holdings: true });

  console.log(`  Synced ${mappedPositions.length} positions for account: ${accountName}`);
}

export async function syncBalancesByAccount(
  db: DB,
  snaptradeAccountId: string,
  dbAccountId: string,
  accountName: string
) {
  const rawBalances = await getSnaptradeBalancesByAccount(snaptradeAccountId);
  const mappedBalances = rawBalances
    .map((balance) => mapSnaptradeBalance(balance, dbAccountId))
    .filter((balance): balance is NonNullable<typeof balance> => balance !== null);

  await reconcileAccountBalances(db, dbAccountId, mappedBalances);
  console.log(`  Synced ${mappedBalances.length} balances for account: ${accountName}`);
  return mappedBalances;
}

export async function syncOrdersByAccount(
  db: DB,
  snaptradeAccountId: string,
  dbAccountId: string,
  accountName: string
) {
  const rawOrders = await getSnaptradeOrdersByAccount(snaptradeAccountId, 90);
  const mappedOrders = await mapSnaptradeOrdersWithSecurities(
    db,
    rawOrders,
    dbAccountId
  );

  await upsertAccountOrders(db, dbAccountId, mappedOrders);
  console.log(`  Synced ${mappedOrders.length} orders for account: ${accountName}`);
  return mappedOrders;
}
 
