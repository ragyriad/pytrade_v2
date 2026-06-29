import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const databaseUrl = new URL(connectionString);
const client = postgres({
  host: databaseUrl.hostname,
  port: databaseUrl.port ? Number(databaseUrl.port) : 5432,
  database: databaseUrl.pathname.replace(/^\//, ""),
  user: decodeURIComponent(databaseUrl.username),
  username: decodeURIComponent(databaseUrl.username),
  password: decodeURIComponent(databaseUrl.password),
  ssl: databaseUrl.searchParams.get("sslmode") === "require" ? "require" : false,
} as postgres.Options<Record<string, postgres.PostgresType>> & { user: string });

type Transaction = {
  id: string;
  securityId: string | null;
  type: string;
  action: string | null;
  assetType: string | null;
  description: string | null;
  amount: string | number;
  price: string | number | null;
  units: string | number | null;
  fee: string | number;
  currencyCode: string | null;
  symbol: string | null;
  tradeDate: Date | string;
};

type TransactionWithAccount = {
  transaction: Transaction;
  account: {
    id: string;
    name: string | null;
    brokerageName: string | null;
    type: string | null;
  };
};

type DuplicateGroup = {
  key: string;
  keep: TransactionWithAccount;
  remove: TransactionWithAccount[];
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
}

function normalizeAccountType(value: string | null | undefined): string {
  const normalized = normalizeText(value).replace(/[_-]/g, " ");

  if (normalized.includes("tfsa")) return "tfsa";
  if (normalized.includes("fhsa")) return "fhsa";
  if (normalized.includes("rrsp")) return "rrsp";
  if (normalized.includes("non registered")) return "non registered";
  if (normalized.includes("cash") || normalized.includes("msb")) return "non registered";

  return normalized || "unknown";
}

function normalizeDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function normalizeNumber(value: string | number | null | undefined): string {
  if (value == null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(6) : "";
}

function normalizeDisplayedPrice(value: string | number | null | undefined): string {
  if (value == null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "";
}

function getDedupeKey(row: TransactionWithAccount): string {
  const transaction = row.transaction;

  return [
    normalizeText(row.account.brokerageName),
    normalizeAccountType(row.account.type),
    normalizeDate(transaction.tradeDate),
    normalizeText(transaction.action ?? transaction.type),
    normalizeText(transaction.assetType),
    normalizeText(transaction.securityId ?? transaction.symbol),
    normalizeText(transaction.currencyCode),
    normalizeNumber(transaction.amount),
    normalizeNumber(transaction.units),
    normalizeDisplayedPrice(transaction.price),
    normalizeNumber(transaction.fee),
  ].join("|");
}

function scoreRow(row: TransactionWithAccount): number {
  const accountName = normalizeText(row.account.name);
  const brokerageName = normalizeText(row.account.brokerageName);
  const description = normalizeText(row.transaction.description);

  return [
    accountName && brokerageName && accountName.includes(brokerageName) ? 4 : 0,
    accountName && accountName !== normalizeAccountType(row.account.type) ? 2 : 0,
    description.includes("order") ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function findDuplicateGroups(rows: TransactionWithAccount[]): DuplicateGroup[] {
  const rowsByKey = new Map<string, TransactionWithAccount[]>();

  for (const row of rows) {
    const key = getDedupeKey(row);
    rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
  }

  return Array.from(rowsByKey.entries())
    .filter(([, group]) => {
      const accountIds = new Set(group.map((row) => row.account.id));
      return group.length > 1 && accountIds.size > 1;
    })
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => {
        const scoreDiff = scoreRow(b) - scoreRow(a);
        if (scoreDiff !== 0) return scoreDiff;
        return a.transaction.id.localeCompare(b.transaction.id);
      });

      return {
        key,
        keep: sorted[0],
        remove: sorted.slice(1),
      };
    });
}

function printDuplicateGroups(groups: DuplicateGroup[]): void {
  if (groups.length === 0) {
    console.log("No duplicate transaction groups found.");
    return;
  }

  const duplicateCount = groups.reduce((sum, group) => sum + group.remove.length, 0);
  console.log(`Found ${groups.length} duplicate groups, ${duplicateCount} rows to remove.`);

  for (const group of groups) {
    const keep = group.keep;
    console.log("");
    console.log(
      [
        normalizeDate(keep.transaction.tradeDate),
        keep.transaction.type,
        keep.transaction.symbol ?? keep.transaction.securityId ?? "unknown",
        `${keep.transaction.currencyCode ?? "USD"} ${keep.transaction.amount}`,
        `units=${keep.transaction.units ?? "-"}`,
        `price=${keep.transaction.price ?? "-"}`,
        `fee=${keep.transaction.fee}`,
      ].join(" | ")
    );
    console.log(`  keep   ${keep.transaction.id} ${keep.account.name ?? "Account"}`);

    for (const row of group.remove) {
      console.log(`  remove ${row.transaction.id} ${row.account.name ?? "Account"}`);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await client<TransactionWithAccount[]>`
    select
      json_build_object(
        'id', transactions.id,
        'securityId', transactions.security_id,
        'type', transactions.type,
        'action', transactions.action,
        'assetType', transactions.asset_type,
        'description', transactions.description,
        'amount', transactions.amount,
        'price', transactions.price,
        'units', transactions.units,
        'fee', transactions.fee,
        'currencyCode', transactions.currency_code,
        'symbol', transactions.symbol,
        'tradeDate', transactions.trade_date
      ) as transaction,
      json_build_object(
        'id', accounts.id,
        'name', accounts.name,
        'brokerageName', accounts.brokerage_name,
        'type', accounts.type
      ) as account
    from transactions
    inner join accounts on transactions.account_id = accounts.id
  `;
  const groups = findDuplicateGroups(rows);
  const idsToRemove = groups.flatMap((group) =>
    group.remove.map((row) => row.transaction.id)
  );

  printDuplicateGroups(groups);

  if (!apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to delete duplicate rows.");
    await client.end();
    return;
  }

  if (idsToRemove.length === 0) {
    await client.end();
    return;
  }

  await client`
    delete from transactions
    where id in ${client(idsToRemove)}
  `;
  console.log("");
  console.log(`Deleted ${idsToRemove.length} duplicate transaction rows.`);
  await client.end();
}

main().catch((error) => {
  console.error(error);
  void client.end();
  process.exitCode = 1;
});
