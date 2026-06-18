import {
  syncAccounts,
  syncTransactionsByAccount,
  syncPositionsByAccount,
} from "../sync_functions.js";
import {
  getAccountBySnaptradeId,
  markAccountSynced,
  upsertTransactions,
  replaceAccountPositions,
  mapSnaptradeTransaction,
  mapSnaptradePosition,
} from "@repo/db";
import type { NewTransaction, NewPosition } from "@repo/db";
import { db, createSeed } from "@repo/db";
import {
  getSnaptradeTransactionsByAccountId,
  getSnaptradePositionsByAccount,
} from "../snaptrade.js";

async function main() {
  const adminUser = await createSeed(db);
  console.log("***Admin User***");
  console.log(adminUser);

  const startDate = "2020-01-01";
  const endDate = new Date().toISOString().split("T")[0];

  try {
    // ------------------------------------------------------------------
    // Step 1: Sync accounts
    // ------------------------------------------------------------------
    const rawAccounts = await syncAccounts(db, adminUser.id);
    console.log(`\nFetched ${rawAccounts.length} accounts`);

    // ------------------------------------------------------------------
    // Step 2: Resolve all internal DB ids upfront
    // ------------------------------------------------------------------
    const resolvedAccounts = (
      await Promise.all(
        rawAccounts.map(async (rawAccount) => {
          const snaptradeAccountId = rawAccount.id;
          const accountName = rawAccount.name ?? snaptradeAccountId;

          if (!snaptradeAccountId) {
            console.warn(`Skipping account with no SnapTrade id:`, rawAccount);
            return null;
          }

          const dbAccount = await getAccountBySnaptradeId(db, snaptradeAccountId);
          if (!dbAccount) {
            console.warn(`Could not resolve DB account for SnapTrade id: ${snaptradeAccountId}`);
            return null;
          }

          return { snaptradeAccountId, dbAccountId: dbAccount.id, accountName };
        })
      )
    ).filter((a): a is NonNullable<typeof a> => a !== null);

    console.log(`Resolved ${resolvedAccounts.length} accounts for sync\n`);

    // ------------------------------------------------------------------
    // Step 3: Fetch all data from SnapTrade — log per account, no DB writes
    // ------------------------------------------------------------------
    const allMappedTransactions: NewTransaction[] = [];
    const allMappedPositions: NewPosition[] = [];

    for (const { snaptradeAccountId, dbAccountId, accountName } of resolvedAccounts) {
      console.log(`Fetching data for: ${accountName}`);

      const rawTransactions = await getSnaptradeTransactionsByAccountId(
        snaptradeAccountId,
        startDate,
        endDate
      );

      if (!rawTransactions || rawTransactions.length === 0) {
        console.log(`  No transactions found`);
      } else {
        const mapped = rawTransactions.map((raw) =>
          mapSnaptradeTransaction(raw, dbAccountId)
        );
        allMappedTransactions.push(...mapped);
        console.log(`  Fetched ${mapped.length} transactions`);
      }

      const rawPositions = await getSnaptradePositionsByAccount(snaptradeAccountId);

      if (!rawPositions || rawPositions.length === 0) {
        console.log(`  No positions found`);
      } else {
        const mapped = rawPositions.map((raw) =>
          mapSnaptradePosition(raw, dbAccountId)
        );
        allMappedPositions.push(...mapped);
        console.log(`  Fetched ${mapped.length} positions`);
      }
    }

    // ------------------------------------------------------------------
    // Step 4: Bulk persist
    // ------------------------------------------------------------------
    console.log(`\nPersisting...`);

    await upsertTransactions(db, allMappedTransactions);
    console.log(`  Persisted ${allMappedTransactions.length} transactions`);

    // Positions are per-account snapshots so replace is still per-account,
    // but batched in a single transaction rather than scattered in the loop
    await db.transaction(async (tx) => {
      for (const { dbAccountId, accountName } of resolvedAccounts) {
        const accountPositions = allMappedPositions.filter(
          (p) => p.accountId === dbAccountId
        );
        await replaceAccountPositions(tx, dbAccountId, accountPositions);
        console.log(`  Replaced ${accountPositions.length} positions for: ${accountName}`);
      }
    });

    // ------------------------------------------------------------------
    // Step 5: Mark all accounts synced
    // ------------------------------------------------------------------
    await db.transaction(async (tx) => {
      for (const { dbAccountId } of resolvedAccounts) {
        await markAccountSynced(tx, dbAccountId, {
          holdings: true,
          transactions: true,
        });
      }
    });

    console.log("\nSync complete.");
  } catch (err) {
    console.error("Sync failed:", err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
