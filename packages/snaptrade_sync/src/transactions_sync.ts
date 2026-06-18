// import { DB } from "../db_type.js";
// import { getAccountsByConnection } from "../persistence/accounts_persistence.js";
// import {
//   upsertTransactions,
//   deleteTransactionsByAccount,
// } from "../persistence/transactions_persistence.js";
// import { mapSnaptradeTransaction } from "../mappers/transaction_mapper.js";
// import { markAccountSynced } from "../persistence/accounts_persistence.js";
// // Replace with your actual SnapTrade client import
// import { snaptradeClient } from "../clients/snaptrade.js";

// /**
//  * Syncs all transactions for every account belonging to a brokerage connection.
//  * Called by the sync worker on a schedule or triggered manually.
//  *
//  * @example
//  * await syncTransactionsForConnection(db, brokerageConnectionId, userId);
//  */
// export async function syncTransactionsForConnection(
//   db: DB,
//   brokerageConnectionId: string,
//   userId: string
// ): Promise<void> {
//   const accounts = await getAccountsByConnection(db, brokerageConnectionId);

//   for (const account of accounts) {
//     await syncTransactionsForAccount(db, account.id, userId);
//   }
// }

// /**
//  * Syncs transactions for a single account.
//  * Fetches from SnapTrade, maps, and bulk-upserts into the DB.
//  *
//  * @example
//  * await syncTransactionsForAccount(db, accountId, userId);
//  */
// export async function syncTransactionsForAccount(
//   db: DB,
//   accountId: string,
//   userId: string
// ): Promise<void> {
//   // 1. Fetch raw transactions from SnapTrade
//   const rawTransactions = await snaptradeClient.transactionsAndReporting.getActivities({
//     userId,
//     // accountId filtering is SDK-specific — adjust as needed
//   });

//   if (!rawTransactions.data || rawTransactions.data.length === 0) {
//     await markAccountSynced(db, accountId, { transactions: true });
//     return;
//   }

//   // 2. Map raw SnapTrade transactions → NewTransaction rows
//   const mapped = rawTransactions.data.map((raw) =>
//     mapSnaptradeTransaction(raw, accountId)
//   );

//   // 3. Bulk upsert — safe to re-run; idempotent on snaptradeTransactionId
//   await upsertTransactions(db, mapped);

//   // 4. Mark the account as synced
//   await markAccountSynced(db, accountId, { transactions: true });
// }

// /**
//  * Full re-sync: wipes existing transactions for the account and re-inserts.
//  * Use only when you need a clean slate (e.g. a data correction run).
//  *
//  * @example
//  * await resyncTransactionsForAccount(db, accountId, userId);
//  */
// export async function resyncTransactionsForAccount(
//   db: DB,
//   accountId: string,
//   userId: string
// ): Promise<void> {
//   const rawTransactions = await snaptradeClient.transactionsAndReporting.getActivities({
//     userId,
//   });

//   // Wipe existing rows first
//   await deleteTransactionsByAccount(db, accountId);

//   if (!rawTransactions.data || rawTransactions.data.length === 0) {
//     await markAccountSynced(db, accountId, { transactions: true });
//     return;
//   }

//   const mapped = rawTransactions.data.map((raw) =>
//     mapSnaptradeTransaction(raw, accountId)
//   );

//   await upsertTransactions(db, mapped);
//   await markAccountSynced(db, accountId, { transactions: true });
// }
