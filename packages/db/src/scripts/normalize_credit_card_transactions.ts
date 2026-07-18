import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type CreditCardTransactionRow = {
  id: string;
  account_id: string;
  trade_date: Date | string;
  amount: string | number;
  currency_code: string | null;
  type: string;
  action: string | null;
  description: string | null;
  created_at: Date | string;
  snaptrade_transaction_id: string | null;
};

type DuplicateGroup = {
  key: string;
  keep: CreditCardTransactionRow;
  archive: CreditCardTransactionRow[];
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function normalizeNumber(value: string | number): string {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
}

function isGenericCreditCardDescription(value: string | null | undefined): boolean {
  const normalized = normalizeText(value);
  return normalized === "CREDIT_CARD" || normalized === "CREDIT CARD";
}

function dedupeKey(row: CreditCardTransactionRow): string {
  return [
    row.account_id,
    new Date(row.trade_date).toISOString(),
    normalizeNumber(row.amount),
    row.currency_code ?? "",
    normalizeText(row.action ?? row.type),
    isGenericCreditCardDescription(row.description) ? "" : normalizeText(row.description),
  ].join("|");
}

function findDuplicateGroups(rows: CreditCardTransactionRow[]): DuplicateGroup[] {
  const byKey = new Map<string, CreditCardTransactionRow[]>();

  for (const row of rows) {
    const key = dedupeKey(row);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  return Array.from(byKey.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => {
        const createdDiff =
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        if (createdDiff !== 0) return createdDiff;
        return a.id.localeCompare(b.id);
      });

      return {
        key,
        keep: sorted[0],
        archive: sorted.slice(1),
      };
    });
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await client<CreditCardTransactionRow[]>`
    select
      t.id,
      t.account_id,
      t.trade_date,
      t.amount,
      t.currency_code,
      t.type,
      t.action,
      t.description,
      t.created_at,
      t.snaptrade_transaction_id
    from transactions t
    join accounts a on a.id = t.account_id
    where not t.is_archived
      and (
        upper(
          coalesce(a.type, '') || ' ' ||
          coalesce(a.raw_type, '') || ' ' ||
          coalesce(a.snaptrade_meta_type, '') || ' ' ||
          coalesce(a.snaptrade_unified_account_type, '') || ' ' ||
          coalesce(a.name, '') || ' ' ||
          coalesce(a.brokerage_name, '')
        ) like '%CREDIT%'
        or upper(
          coalesce(a.type, '') || ' ' ||
          coalesce(a.raw_type, '') || ' ' ||
          coalesce(a.snaptrade_meta_type, '') || ' ' ||
          coalesce(a.snaptrade_unified_account_type, '') || ' ' ||
          coalesce(a.name, '') || ' ' ||
          coalesce(a.brokerage_name, '')
        ) like '%CARD%'
      )
  `;
  const genericDescriptionIds = rows
    .filter((row) => isGenericCreditCardDescription(row.description))
    .map((row) => row.id);
  const duplicateGroups = findDuplicateGroups(rows);
  const duplicateIds = duplicateGroups.flatMap((group) =>
    group.archive.map((row) => row.id)
  );

  console.log(`Credit-card transactions scanned: ${rows.length}`);
  console.log(`Generic descriptions to clear: ${genericDescriptionIds.length}`);
  console.log(
    `Duplicate groups found: ${duplicateGroups.length}, rows to archive: ${duplicateIds.length}`
  );

  for (const group of duplicateGroups.slice(0, 20)) {
    console.log("");
    console.log(
      [
        new Date(group.keep.trade_date).toISOString(),
        `${group.keep.currency_code ?? ""} ${group.keep.amount}`,
        group.keep.description ?? "-",
      ].join(" | ")
    );
    console.log(
      `  keep    ${group.keep.id} snaptrade=${group.keep.snaptrade_transaction_id ?? "-"}`
    );

    for (const row of group.archive) {
      console.log(`  archive ${row.id} snaptrade=${row.snaptrade_transaction_id ?? "-"}`);
    }
  }

  if (!apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to normalize credit-card transactions.");
    await client.end();
    return;
  }

  await client.begin(async (tx) => {
    if (genericDescriptionIds.length > 0) {
      await tx`
        update transactions
        set description = null
        where id in ${tx(genericDescriptionIds)}
      `;
    }

    if (duplicateIds.length > 0) {
      await tx`
        update transactions
        set is_archived = true
        where id in ${tx(duplicateIds)}
      `;
    }
  });

  console.log("");
  console.log(
    `Normalized ${genericDescriptionIds.length} descriptions and archived ${duplicateIds.length} duplicate rows.`
  );
  await client.end();
}

main().catch((error) => {
  console.error(error);
  void client.end();
  process.exitCode = 1;
});
