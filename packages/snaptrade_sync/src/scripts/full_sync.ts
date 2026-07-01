import { syncAccounts } from "../sync_functions.js";
import { processAccountActivities } from "@repo/snaptrade-activity-processor";
import {
  getAccountBySnaptradeId,
  markAccountSynced,
  replaceAccountPositions,
  mapSnaptradePosition,
} from "@repo/db";
import type { NewPosition } from "@repo/db";
import { db, createSeed } from "@repo/db";
import {
  getSnaptradeTransactionsByAccountId,
  getSnaptradePositionsByAccount,
} from "../snaptrade.js";

async function closeDatabase() {
  const client = (db as typeof db & { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}

async function main() {
  try {
    const adminUser = await createSeed(db);

    const startDate = "2019-01-01";
    const endDate = new Date().toISOString().split("T")[0];

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

          return {
            snaptradeAccountId,
            dbAccountId: dbAccount.id,
            accountName,
            accountType: dbAccount.type,
          };
        })
      )
    ).filter((a): a is NonNullable<typeof a> => a !== null);

    console.log(`Resolved ${resolvedAccounts.length} accounts for sync\n`);

    // ------------------------------------------------------------------
    // Step 3: Fetch all data from SnapTrade — log per account, no DB writes
    // ------------------------------------------------------------------
    const allRawTransactionsByAccount: Array<{
      dbAccountId: string;
      accountName: string;
      accountType: string | null;
      rawTransactions: Awaited<ReturnType<typeof getSnaptradeTransactionsByAccountId>>;
    }> = [];
    const allMappedPositions: NewPosition[] = [];

    for (const { snaptradeAccountId, dbAccountId, accountName, accountType } of resolvedAccounts) {
      console.log(`Fetching data for: ${accountName}`);

      const rawTransactions = await getSnaptradeTransactionsByAccountId(
        snaptradeAccountId,
        startDate,
        endDate
      );

      if (!rawTransactions || rawTransactions.length === 0) {
        console.log(`  No transactions found`);
      } else {
        allRawTransactionsByAccount.push({
          dbAccountId,
          accountName,
          accountType,
          rawTransactions,
        });
        console.log(`  Fetched ${rawTransactions.length} transactions`);
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

    let persistedTransactionCount = 0;
    let persistedSecurityCount = 0;

    for (const { dbAccountId, accountName, accountType, rawTransactions } of allRawTransactionsByAccount) {
      const result = await processAccountActivities({
        db,
        accountId: dbAccountId,
        accountType,
        activities: rawTransactions,
      });
      persistedTransactionCount += result.transactionsProcessed;
      persistedSecurityCount += result.securitiesProcessed;
      console.log(
        `  Persisted ${result.transactionsProcessed} transactions and ${result.securitiesProcessed} securities for: ${accountName}`
      );
    }

    console.log(
      `  Persisted ${persistedTransactionCount} transactions and ${persistedSecurityCount} securities total`
    );

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
  } finally {
    await closeDatabase();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
