import { getSnaptradeTransactionsByAccountId } from "../snaptrade.js";
import { getWorkspaceParentEnvPath } from "../env.js";
import { saveListToJson } from "../helper_functions.js";
import { db, createSeed } from "@repo/db"
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

    const snaptradeAccount = requireEnv("SNAPTRADE_WS_ACCOUNT_ID");
    const startDate = "2020-01-01";
    const endDate = new Date().toISOString().split("T")[0];

    const rawTransactions = await getSnaptradeTransactionsByAccountId( snaptradeAccount, startDate,endDate,"BUY") ;
    saveListToJson({ data: rawTransactions,filename:"transactions",brokerage:"wealth"});
  } catch (err)
  {
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


