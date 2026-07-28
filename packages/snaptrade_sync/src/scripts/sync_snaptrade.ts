import {
  DEFAULT_SNAPTRADE_ACTIVITY_START_DATE,
  getTransactionSyncStartDate,
  syncAccounts,
} from "../sync_functions.js";
import { processAccountActivities } from "../ingestion/index.js";
import {
  getAccountBySnaptradeId,
  deleteSnaptradeTransactionsByAccount,
  markAccountSynced,
  upsertAccountBalances,
  reconcileAccountPositions,
  upsertAccountOrders,
} from "@repo/db";
import type { NewAccountBalance, NewOrder, NewPosition } from "@repo/db";
import { db, createSeed } from "@repo/db";
import {
  getSnaptradeTransactionsByAccountId,
  getSnaptradeBalancesByAccount,
  getSnaptradeOrdersByAccount,
  getSnaptradePositionsByAccount,
} from "../snaptrade.js";
import { mapSnaptradePositionsWithSecurities } from "../position_securities.js";
import { mapSnaptradeOrdersWithSecurities } from "../order_securities.js";
import { mapSnaptradeBalance } from "../mappers/account_balance_mapper.js";

async function closeDatabase() {
  const client = (db as typeof db & { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}

async function main() {
  try {
    const replaceSnaptradeData =
      process.argv.includes("--replace-snaptrade-data") ||
      process.argv.includes("--replace");
    if (replaceSnaptradeData) {
      console.warn(
        "\nReplace mode enabled: existing SnapTrade transactions will be deleted " +
        "only after all account data has been fetched successfully. Statement and " +
        "legacy transactions will be preserved."
      );
    }

    const adminUser = await createSeed(db);

    const fallbackStartDate = DEFAULT_SNAPTRADE_ACTIVITY_START_DATE;
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
            providerName: dbAccount.brokerageName,
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
      providerName: string | null;
      rawTransactions: Awaited<ReturnType<typeof getSnaptradeTransactionsByAccountId>>;
    }> = [];
    const allRawPositionsByAccount: Array<{
      dbAccountId: string;
      accountName: string;
      rawPositions: Awaited<ReturnType<typeof getSnaptradePositionsByAccount>>;
    }> = [];
    const allRawBalancesByAccount: Array<{
      dbAccountId: string;
      accountName: string;
      rawBalances: Awaited<ReturnType<typeof getSnaptradeBalancesByAccount>>;
    }> = [];
    const allRawOrdersByAccount: Array<{
      dbAccountId: string;
      accountName: string;
      rawOrders: Awaited<ReturnType<typeof getSnaptradeOrdersByAccount>>;
    }> = [];

    for (const {
      snaptradeAccountId,
      dbAccountId,
      accountName,
      accountType,
      providerName,
    } of resolvedAccounts) {
      console.log(`Fetching data for: ${accountName}`);

      const startDate = replaceSnaptradeData
        ? fallbackStartDate
        : await getTransactionSyncStartDate(
            db,
            dbAccountId,
            fallbackStartDate
          );
      console.log(`  Fetching transactions from ${startDate} through ${endDate}`);

      const rawTransactions = await getSnaptradeTransactionsByAccountId(
        snaptradeAccountId,
        startDate,
        endDate
      );

      if (rawTransactions.length === 0) {
        console.log(`  No transactions found`);
      } else {
        console.log(`  Fetched ${rawTransactions.length} transactions`);
      }
      allRawTransactionsByAccount.push({
        dbAccountId,
        accountName,
        accountType,
        providerName,
        rawTransactions,
      });

      const rawPositions = await getSnaptradePositionsByAccount(snaptradeAccountId);

      if (!rawPositions || rawPositions.length === 0) {
        console.log(`  No positions found`);
      } else {
        allRawPositionsByAccount.push({
          dbAccountId,
          accountName,
          rawPositions,
        });
        console.log(`  Fetched ${rawPositions.length} positions`);
      }

      const rawBalances = await getSnaptradeBalancesByAccount(snaptradeAccountId);
      allRawBalancesByAccount.push({ dbAccountId, accountName, rawBalances });
      console.log(`  Fetched ${rawBalances.length} balances`);

      const rawOrders = await getSnaptradeOrdersByAccount(snaptradeAccountId, 90);
      allRawOrdersByAccount.push({ dbAccountId, accountName, rawOrders });
      console.log(`  Fetched ${rawOrders.length} recent orders`);
    }

    // ------------------------------------------------------------------
    // Step 4: Bulk persist
    // ------------------------------------------------------------------
    console.log(`\nPersisting...`);

    let persistedTransactionCount = 0;
    let persistedSecurityCount = 0;
    let skippedDuplicateActivityCount = 0;
    let normalizedCashTransactionCount = 0;
    let archivedDuplicateTransactionCount = 0;
    let deletedSnaptradeTransactionCount = 0;

    for (const {
      dbAccountId,
      accountName,
      accountType,
      providerName,
      rawTransactions,
    } of allRawTransactionsByAccount) {
      let result: Awaited<ReturnType<typeof processAccountActivities>>;
      if (replaceSnaptradeData) {
        const replacement = await db.transaction(async (tx) => {
          const deleted = await deleteSnaptradeTransactionsByAccount(
            tx,
            dbAccountId
          );
          const processed = await processAccountActivities({
            db: tx,
            accountId: dbAccountId,
            accountType,
            providerName,
            activities: rawTransactions,
          });
          return { deleted, processed };
        });
        deletedSnaptradeTransactionCount += replacement.deleted;
        result = replacement.processed;
      } else {
        result = await processAccountActivities({
          db,
          accountId: dbAccountId,
          accountType,
          providerName,
          activities: rawTransactions,
        });
      }
      persistedTransactionCount += result.transactionsProcessed;
      persistedSecurityCount += result.securitiesProcessed;
      skippedDuplicateActivityCount += result.duplicateActivitiesSkipped;
      normalizedCashTransactionCount += result.cashTransactionsNormalized;
      archivedDuplicateTransactionCount += result.duplicateTransactionsArchived;
      console.log(
        `  Persisted ${result.transactionsProcessed} transactions and ` +
        `${result.securitiesProcessed} securities for: ${accountName}` +
        (result.duplicateActivitiesSkipped > 0
          ? ` (${result.duplicateActivitiesSkipped} provider duplicates skipped)`
          : "") +
        (result.cashTransactionsNormalized > 0
          ? ` (${result.cashTransactionsNormalized} cash rows normalized)`
          : "") +
        (result.duplicateTransactionsArchived > 0
          ? ` (${result.duplicateTransactionsArchived} stored duplicates archived)`
          : "")
      );
    }

    console.log(
      `  Persisted ${persistedTransactionCount} transactions and ${persistedSecurityCount} securities total`
    );
    if (replaceSnaptradeData) {
      console.log(
        `  Deleted ${deletedSnaptradeTransactionCount} existing SnapTrade transactions before replacement`
      );
    }
    if (
      skippedDuplicateActivityCount > 0 ||
      normalizedCashTransactionCount > 0 ||
      archivedDuplicateTransactionCount > 0
    ) {
      console.log(
        `  Removed ${skippedDuplicateActivityCount} duplicate fetched activities and ` +
        `normalized ${normalizedCashTransactionCount} cash transactions; ` +
        `archived ${archivedDuplicateTransactionCount} duplicate stored transactions`
      );
    }

    const allMappedPositions: NewPosition[] = [];
    for (const { dbAccountId, accountName, rawPositions } of allRawPositionsByAccount) {
      const mappedPositions = await mapSnaptradePositionsWithSecurities(
        db,
        rawPositions,
        dbAccountId
      );
      allMappedPositions.push(...mappedPositions);
      console.log(`  Mapped ${mappedPositions.length} positions with securities for: ${accountName}`);
    }

    const allMappedBalances: NewAccountBalance[] = allRawBalancesByAccount.flatMap(
      ({ dbAccountId, rawBalances }) =>
        rawBalances
          .map((balance) => mapSnaptradeBalance(balance, dbAccountId))
          .filter((balance): balance is NewAccountBalance => balance !== null)
    );

    const allMappedOrders: NewOrder[] = [];
    for (const { dbAccountId, accountName, rawOrders } of allRawOrdersByAccount) {
      const mappedOrders = await mapSnaptradeOrdersWithSecurities(
        db,
        rawOrders,
        dbAccountId
      );
      allMappedOrders.push(...mappedOrders);
      console.log(`  Mapped ${mappedOrders.length} recent orders for: ${accountName}`);
    }

    for (const { dbAccountId, accountName } of resolvedAccounts) {
      const accountPositions = allMappedPositions.filter(
        (position) => position.accountId === dbAccountId
      );
      await reconcileAccountPositions(db, dbAccountId, accountPositions);
      console.log(`  Reconciled ${accountPositions.length} positions for: ${accountName}`);

      const accountBalances = allMappedBalances.filter(
        (balance) => balance.accountId === dbAccountId
      );
      await upsertAccountBalances(db, dbAccountId, accountBalances);
      console.log(`  Upserted ${accountBalances.length} balances for: ${accountName}`);

      const accountOrders = allMappedOrders.filter(
        (order) => order.accountId === dbAccountId
      );
      await upsertAccountOrders(db, dbAccountId, accountOrders);
      console.log(`  Upserted ${accountOrders.length} recent orders for: ${accountName}`);
    }

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
