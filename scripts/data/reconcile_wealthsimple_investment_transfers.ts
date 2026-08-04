import * as dotenv from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";
import { planSnaptradeInvestmentTransferActions } from "../../packages/snaptrade_sync/src/ingestion/wealthsimple_transfer_matching.js";

dotenv.config({ path: resolve(process.cwd(), ".env"), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Run this command from the repository root.");
}

const client = postgres(connectionString);

type AccountRow = {
  id: string;
  brokerage_name: string | null;
  type: string | null;
  raw_type: string | null;
  snaptrade_meta_type: string | null;
  snaptrade_unified_account_type: string | null;
  name: string | null;
};

type TransactionRow = {
  id: string;
  account_id: string;
  action: string | null;
  type: string;
  amount: string;
  currency_code: string | null;
  trade_date: Date;
  external_transaction_id: string | null;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm=RECONCILE-WEALTHSIMPLE-INVESTMENTS");
  if (apply && !confirmed) {
    throw new Error("Applying requires --confirm=RECONCILE-WEALTHSIMPLE-INVESTMENTS.");
  }

  const [accountRows, transactionRows] = await Promise.all([
    client<AccountRow[]>`
      select id, brokerage_name, type, raw_type, snaptrade_meta_type,
        snaptrade_unified_account_type, name
      from accounts
      where is_archived = false
        and upper(coalesce(brokerage_name, '')) like '%WEALTHSIMPLE%'
    `,
    client<TransactionRow[]>`
      select t.id, t.account_id, t.action, t.type, t.amount, t.currency_code,
        t.trade_date, t.external_transaction_id
      from transactions t
      join accounts a on a.id = t.account_id
      where t.is_archived = false
        and upper(t.source) = 'SNAPTRADE'
        and a.is_archived = false
        and upper(coalesce(a.brokerage_name, '')) like '%WEALTHSIMPLE%'
    `,
  ]);

  const plan = planSnaptradeInvestmentTransferActions(
    accountRows.map((row) => ({
      id: row.id,
      brokerageName: row.brokerage_name,
      type: row.type,
      rawType: row.raw_type,
      snaptradeMetaType: row.snaptrade_meta_type,
      snaptradeUnifiedAccountType: row.snaptrade_unified_account_type,
      name: row.name,
    })),
    transactionRows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      action: row.action,
      type: row.type,
      amount: row.amount,
      currencyCode: row.currency_code,
      tradeDate: row.trade_date,
      externalTransactionId: row.external_transaction_id,
    }))
  );
  const transactionById = new Map(transactionRows.map((row) => [row.id, row]));
  const accountById = new Map(accountRows.map((row) => [row.id, row]));
  const pairs = plan.sentTransactionIds.map((sentId, index) => {
    const sent = transactionById.get(sentId)!;
    const received = transactionById.get(plan.receivedTransactionIds[index])!;
    const sentAccount = accountById.get(sent.account_id)!;
    const receivedAccount = accountById.get(received.account_id)!;
    return {
      amount: sent.amount,
      currency: sent.currency_code,
      from: sentAccount.name ?? sentAccount.type ?? sent.account_id,
      to: receivedAccount.name ?? receivedAccount.type ?? received.account_id,
      sentAt: sent.trade_date.toISOString(),
      receivedAt: received.trade_date.toISOString(),
      matchingReference: Boolean(sent.external_transaction_id && sent.external_transaction_id === received.external_transaction_id),
    };
  });

  console.log(JSON.stringify({
    mode: apply ? "apply" : "preview",
    wealthsimpleAccountsScanned: accountRows.length,
    snaptradeTransactionsScanned: transactionRows.length,
    transfersMatched: pairs.length,
        rowsToNormalize: pairs.length * 2,
    sample: pairs.slice(0, 25),
  }, null, 2));

  if (!apply || plan.sentTransactionIds.length === 0) return;
  await client.begin(async (sql) => {
    await sql`
      update transactions set action = 'TRANSFER_OUT'
      where id = any(${sql.array(plan.sentTransactionIds)}::uuid[]) and is_archived = false
    `;
    await sql`
      update transactions set action = 'CONTRIBUTION'
      where id = any(${sql.array(plan.receivedTransactionIds)}::uuid[]) and is_archived = false
    `;
  });
  console.log(`Normalized ${pairs.length * 2} transaction rows across ${pairs.length} transfer(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
