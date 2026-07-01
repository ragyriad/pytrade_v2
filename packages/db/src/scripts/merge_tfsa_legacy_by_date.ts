import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

const LEGACY_BROKERAGE_ACCOUNT_NUMBER = "51983522";
const CANONICAL_BROKERAGE_ACCOUNT_NUMBER = "9e03899b-ba31-4982-01ce-274278019c28";

type AccountRow = {
  id: string;
  name: string | null;
  brokerage_account_number: string | null;
  brokerage_name: string | null;
  type: string | null;
};

type SummaryRow = {
  legacy_total: number;
  legacy_enabled: number;
  legacy_archived: number;
  canonical_total: number;
  canonical_enabled: number;
  earliest_canonical_trade_date: Date | null;
};

type PlannedCounts = {
  move_count: number;
  archive_count: number;
};

async function ensureColumns() {
  await client`
    alter table transactions
      add column if not exists is_archived boolean not null default false
  `;
  await client`create index if not exists transactions_is_archived_idx on transactions (is_archived)`;
}

async function getAccount(brokerageAccountNumber: string): Promise<AccountRow | null> {
  const rows = await client<AccountRow[]>`
    select id, name, brokerage_account_number, brokerage_name, type
    from accounts
    where brokerage_account_number = ${brokerageAccountNumber}
    order by created_at asc
  `;

  if (rows.length === 0) {
    return null;
  }

  if (rows.length > 1) {
    throw new Error(
      `Expected exactly one account with brokerage_account_number=${brokerageAccountNumber}, found ${rows.length}.`
    );
  }

  return rows[0];
}

async function getSummary(legacyAccountId: string, canonicalAccountId: string): Promise<SummaryRow> {
  const rows = await client<SummaryRow[]>`
    select
      count(*) filter (where account_id = ${legacyAccountId})::int as legacy_total,
      count(*) filter (
        where account_id = ${legacyAccountId} and is_archived = false
      )::int as legacy_enabled,
      count(*) filter (
        where account_id = ${legacyAccountId} and is_archived = true
      )::int as legacy_archived,
      count(*) filter (where account_id = ${canonicalAccountId})::int as canonical_total,
      count(*) filter (
        where account_id = ${canonicalAccountId} and is_archived = false
      )::int as canonical_enabled,
      min(trade_date) filter (
        where account_id = ${canonicalAccountId} and is_archived = false
      ) as earliest_canonical_trade_date
    from transactions
    where account_id in (${legacyAccountId}, ${canonicalAccountId})
  `;

  return rows[0];
}

async function getPlannedCounts(
  legacyAccountId: string,
  earliestCanonicalTradeDate: Date
): Promise<PlannedCounts> {
  const rows = await client<PlannedCounts[]>`
    select
      count(*) filter (
        where trade_date < ${earliestCanonicalTradeDate} and is_archived = false
      )::int as move_count,
      count(*) filter (
        where trade_date >= ${earliestCanonicalTradeDate} and is_archived = false
      )::int as archive_count
    from transactions
    where account_id = ${legacyAccountId}
  `;

  return rows[0];
}

async function main() {
  const apply = process.argv.includes("--apply");
  await ensureColumns();

  const legacyAccount = await getAccount(LEGACY_BROKERAGE_ACCOUNT_NUMBER);
  const canonicalAccount = await getAccount(CANONICAL_BROKERAGE_ACCOUNT_NUMBER);

  if (!legacyAccount || !canonicalAccount) {
    console.log(
      `Skipping TFSA legacy merge: required account(s) not found. legacy=${Boolean(
        legacyAccount
      )}, canonical=${Boolean(canonicalAccount)}`
    );
    return;
  }

  const before = await getSummary(legacyAccount.id, canonicalAccount.id);

  if (!before.earliest_canonical_trade_date) {
    console.log("Skipping TFSA legacy merge: canonical account has no enabled transactions.");
    return;
  }

  const planned = await getPlannedCounts(
    legacyAccount.id,
    before.earliest_canonical_trade_date
  );

  console.log(
    JSON.stringify(
      {
        apply,
        legacyAccount,
        canonicalAccount,
        earliestCanonicalTradeDate: before.earliest_canonical_trade_date,
        before,
        planned,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to move pre-overlap legacy transactions and archive the rest.");
    return;
  }

  await client.begin(async (tx) => {
    await tx`
      update transactions
      set account_id = ${canonicalAccount.id},
          is_archived = false
      where account_id = ${legacyAccount.id}
        and is_archived = false
        and trade_date < ${before.earliest_canonical_trade_date}
    `;

    await tx`
      update transactions
      set is_archived = true
      where account_id = ${legacyAccount.id}
        and is_archived = false
        and trade_date >= ${before.earliest_canonical_trade_date}
    `;
  });

  const after = await getSummary(legacyAccount.id, canonicalAccount.id);
  console.log(JSON.stringify({ after }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
