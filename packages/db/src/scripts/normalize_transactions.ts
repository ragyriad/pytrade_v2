import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";
import { normalizeTransaction } from "../transaction_normalization.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type TransactionRow = {
  id: string;
  type: string;
  action: string | null;
  asset_type: string | null;
  description: string | null;
  symbol: string | null;
  currency_code: string | null;
  security_id: string | null;
  amount: string | number;
  units: string | number | null;
  account_type: string | null;
  security_symbol: string | null;
  security_raw_symbol: string | null;
  security_description: string | null;
  instrument_type_code: string | null;
  instrument_type_description: string | null;
};

function groupKey(action: string, assetType: string): string {
  return `${action} / ${assetType}`;
}

function isCashAccount(accountType: string | null): boolean {
  const normalized = accountType?.trim().toUpperCase();
  return normalized === "CASH" || normalized === "CASH_USD" || normalized === "CASH_CAD";
}

function isCashPlaceholderSymbol(
  symbol: string | null,
  currencyCode: string | null,
  action: string
): boolean {
  if (action !== "INTEREST" && action !== "REIMBURSEMENT") return false;

  const normalizedSymbol = symbol?.trim().toUpperCase();
  if (!normalizedSymbol) return false;

  const normalizedCurrency = currencyCode?.trim().toUpperCase();
  return (
    normalizedSymbol === normalizedCurrency ||
    normalizedSymbol === "CAD.NE" ||
    normalizedSymbol === "USD"
  );
}

async function ensureColumns() {
  await client`
    alter table transactions
      add column if not exists action varchar(50),
      add column if not exists asset_type varchar(50)
  `;
  await client`create index if not exists transactions_action_idx on transactions (action)`;
  await client`create index if not exists transactions_asset_type_idx on transactions (asset_type)`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  await ensureColumns();

  const rows = await client<TransactionRow[]>`
    select
      transactions.id,
      transactions.type,
      transactions.action,
      transactions.asset_type,
      transactions.description,
      transactions.symbol,
      transactions.currency_code,
      transactions.security_id,
      transactions.amount,
      transactions.units,
      accounts.type as account_type,
      securities.symbol as security_symbol,
      securities.raw_symbol as security_raw_symbol,
      securities.description as security_description,
      securities.instrument_type_code,
      securities.instrument_type_description
    from transactions
    join accounts on transactions.account_id = accounts.id
    left join securities on transactions.security_id = securities.id
  `;

  const planned = rows.map((row) => {
    const normalized = normalizeTransaction(
      {
        type: row.type,
        description: row.description,
        symbol: row.symbol,
        amount: row.amount,
        units: row.units,
      },
      {
        symbol: row.security_symbol,
        raw_symbol: row.security_raw_symbol,
        description: row.security_description,
        instrument_type_code: row.instrument_type_code,
        instrument_type_description: row.instrument_type_description,
      },
      { accountType: row.account_type }
    );

    const cashAccount = isCashAccount(row.account_type);
    const nextType = cashAccount ? "CASH" : row.type;
    const shouldClearSymbol = isCashPlaceholderSymbol(
      row.symbol,
      row.currency_code,
      normalized.action
    );

    return {
      row,
      normalized,
      nextType,
      nextSymbol: shouldClearSymbol ? null : row.symbol,
      nextSecurityId: shouldClearSymbol ? null : row.security_id,
    };
  });

  const changes = planned.filter(
    ({ row, normalized, nextType, nextSymbol, nextSecurityId }) =>
      row.type !== nextType ||
      row.action !== normalized.action ||
      row.asset_type !== normalized.assetType ||
      row.symbol !== nextSymbol ||
      row.security_id !== nextSecurityId
  );

  const summary = new Map<string, number>();
  for (const { normalized } of planned) {
    const key = groupKey(normalized.action, normalized.assetType);
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }

  console.log("Normalized transaction summary:");
  for (const [key, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
  console.log("");
  console.log(`${changes.length} transactions need normalized action/type updates.`);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update transactions.");
    return;
  }

  await client.begin(async (tx) => {
    await tx`
      update accounts
      set type = 'CASH', updated_at = now()
      where type in ('CASH_USD', 'CASH_CAD')
    `;

    for (const { row, normalized, nextType, nextSymbol, nextSecurityId } of changes) {
      await tx`
        update transactions
        set
          type = ${nextType},
          action = ${normalized.action},
          asset_type = ${normalized.assetType},
          symbol = ${nextSymbol},
          security_id = ${nextSecurityId}
        where id = ${row.id}
      `;
    }
  });

  console.log(`Updated ${changes.length} transactions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
