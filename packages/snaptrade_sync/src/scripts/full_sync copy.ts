import {syncTransactionsByAccount, syncAccounts, syncPositionsByAccount} from "../sync_functions.js";
import { getAccountBySnaptradeId } from "@repo/db";
import { db, createSeed } from "@repo/db";  

async function main() {
  const adminUser = await createSeed(db);
  console.log("***Admin User***")
  console.log(adminUser)
  const startDate = "2020-01-01";
  const endDate = new Date().toISOString().split("T")[0];

  try {

    const rawAccounts = await syncAccounts(db, adminUser.id);
    console.log(`\nSyncing transactions for ${rawAccounts.length} accounts...`);

    for (const rawAccount of rawAccounts) {
      const snaptradeAccountId = rawAccount.id;
      const accountName = rawAccount.name ?? snaptradeAccountId;

      if (!snaptradeAccountId) {
        console.warn("Skipping account with no SnapTrade id:", rawAccount);
        continue;
      }

      // 2. Resolve our internal DB id — account was just upserted above
      const dbAccount = await getAccountBySnaptradeId(db, snaptradeAccountId);

      if (!dbAccount) {
        console.warn(`Could not resolve DB account for SnapTrade id: ${snaptradeAccountId}`);
        continue;
      }

      console.log(`Syncing transactions for account: ${accountName}`);

      const persistedTransactions = await syncTransactionsByAccount(
        db,
        snaptradeAccountId,
        dbAccount.id,
        accountName,
        startDate,
        endDate
      );

      const snaptradePositions = await syncPositionsByAccount(db, snaptradeAccountId, dbAccount.id, accountName);

      
    }

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