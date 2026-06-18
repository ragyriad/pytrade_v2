import { Snaptrade } from "snaptrade-typescript-sdk";
import * as dotenv from "dotenv";
import { getWorkspaceParentEnvPath } from "./env.js";

dotenv.config({ path: getWorkspaceParentEnvPath() });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}


const SNAPTRADE_USER_ID = requireEnv("SNAPTRADE_USER_ID");
const CLIENT_ID = requireEnv("SNAPTRADE_CLIENT_ID");
const USER_SECRET = requireEnv("SNAPTRADE_USER_SECRET");
const CONSUMER_KEY = requireEnv("SNAPTRADE_CONSUMER_KEY");

const snaptrade = new Snaptrade({
  clientId: CLIENT_ID,
  consumerKey: CONSUMER_KEY,
});

// ---------------------------------------------------------------------------
// Raw SnapTrade fetchers
// ---------------------------------------------------------------------------

export async function getSnaptradePositionsByAccount(accountId: string) {
  const res = await snaptrade.accountInformation.getUserAccountPositions({
    accountId,
    userId: SNAPTRADE_USER_ID,
    userSecret: USER_SECRET,
  });
  return res.data;
}

export async function getSnaptradeUserAccounts() {
  const res = await snaptrade.accountInformation.listUserAccounts({
    userId: SNAPTRADE_USER_ID,
    userSecret: USER_SECRET,
  });
  return res.data;
}

export async function getSnaptradeBalance(accountId: string) {
  const res = await snaptrade.accountInformation.getUserAccountBalance({
    accountId,
    userId: SNAPTRADE_USER_ID,
    userSecret: USER_SECRET,
  });
  return res.data;
}

export async function getSnaptradeTransactionsByAccountId(
  accountId: string,
  startDate: string,
  endDate: string,
  type?: string
) {
  const res = await snaptrade.accountInformation.getAccountActivities({
    accountId,
    userId: SNAPTRADE_USER_ID,
    userSecret: USER_SECRET,
    startDate,
    endDate,
    ...(type && { type }),
  });
  return res.data?.data ?? [];
}
