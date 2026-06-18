import { getSnaptradeTransactionsByAccountId, getSnaptradeUserAccounts } from "./snaptrade.js"; 
import { markAccountSynced, upsertAccount, replaceAccountPositions , mapSnaptradePosition,
   mapSnaptradeAccount, upsertTransactions, mapSnaptradeTransaction } from "@repo/db"; 
import type { DB } from "@repo/db";
import {getSnaptradePositionsByAccount} from "./snaptrade.js"

export async function syncTransactionsByAccount(
    db: DB,
    snaptradeAccountId: string,  // SnapTrade's UUID — used to query their API
    dbAccountId: string,          // Our internal UUID — used as the FK
    accountName: string,
    startDate: string,
    endDate: string
  ) {
    const rawTransactions = await getSnaptradeTransactionsByAccountId(
      snaptradeAccountId,
      startDate,
      endDate
    );

    if (!rawTransactions || rawTransactions.length === 0) {
      console.log(`  No transactions found for account: ${accountName}`);
      await markAccountSynced(db, dbAccountId, { transactions: true });
      return ;
    }

    const mappedTransactions = rawTransactions.map((raw) =>
      mapSnaptradeTransaction(raw, dbAccountId)
    );

    const persistedTransactions = await upsertTransactions(db, mappedTransactions);
    await markAccountSynced(db, dbAccountId, { transactions: true });

    console.log(`  Synced ${mappedTransactions.length} transactions for account: ${accountName}`);
    return persistedTransactions;
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
 
  if (!rawPositions || rawPositions.length === 0) {
    console.log(`  No positions found for account: ${accountName}`);
    await markAccountSynced(db, dbAccountId, { holdings: true });
    return;
  }
 
  const mappedPositions = rawPositions.map((raw) =>
    mapSnaptradePosition(raw, dbAccountId)
  );
 
  await replaceAccountPositions(db, dbAccountId, mappedPositions);
  await markAccountSynced(db, dbAccountId, { holdings: true });
 
  console.log(`  Synced ${mappedPositions.length} positions for account: ${accountName}`);
}
 
