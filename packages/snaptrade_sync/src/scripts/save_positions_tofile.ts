import { getSnaptradePositionsByAccount } from "../snaptrade.js";
import { getWorkspaceParentEnvPath } from "../env.js";
import { saveListToJson, anonymise } from "../helper_functions.js";
import { db, createSeed, getAccountsByUserId  } from "@repo/db"
import * as dotenv from "dotenv";
dotenv.config({ path: getWorkspaceParentEnvPath() });

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) throw new Error(`Missing required environment variable: ${key}`);
    return value;
  }

async function closeDatabase() {
  const client = (db as typeof db & { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}

async function main() {
  try {
    const adminUser = await createSeed(db);

    const accounts = await getAccountsByUserId(db, adminUser.id);
    const allPositions = [];
    for (const account of accounts) {
        const snaptradeAccountId = account.snaptradeAccountId;
        if (!snaptradeAccountId) continue;
        const rawPositions = await getSnaptradePositionsByAccount(snaptradeAccountId);
        allPositions.push(...rawPositions);
    }
    const anonymizedData = anonymise(allPositions)
    saveListToJson({ data: anonymizedData, filename: "positions", brokerage: "wealth" });
} catch (err) {
    console.log(err);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
  return "File Saved"
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


