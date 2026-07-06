import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

const compactOptionPattern = /\b([A-Z]{1,6})\d{1,2}[A-Z]{3}\d{2}[CP]\d+(?:\.\d+)?\b/i;
const occOptionPattern = /\b([A-Z]{1,6})\d{6}[CP]\d{8}\b/i;
const spacedOptionPattern =
  /\b([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(PUTS?|CALLS?)\s+\d+(?:\.\d+)?\b/i;
const sideFirstOptionPattern =
  /\b(PUTS?|CALLS?)\s+([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+\d+(?:\.\d+)?\b/i;

type SecurityRow = {
  id: string;
  symbol: string;
  raw_symbol: string | null;
  description: string | null;
  currency_code: string | null;
  instrument_type_code: string | null;
  instrument_type_description: string | null;
};

type OptionCandidateRow = {
  transaction_id: string;
  transaction_symbol: string | null;
  transaction_description: string | null;
  currency_code: string | null;
  security_id: string | null;
  security_symbol: string | null;
  raw_symbol: string | null;
  security_description: string | null;
  instrument_type_code: string | null;
  instrument_type_description: string | null;
};

type SecurityMovePlan = {
  oldSecurityId: string;
  oldSymbol: string;
  underlyingSymbol: string;
  targetSecurityId: string | null;
  currencyCode: string | null;
  transactionCount: number;
};

type TransactionMovePlan = {
  transactionId: string;
  currentSymbol: string | null;
  underlyingSymbol: string;
  targetSecurityId: string | null;
  currencyCode: string | null;
};

type TransactionRow = {
  id: string;
  account_id: string;
  snaptrade_transaction_id: string | null;
  source: string;
  external_transaction_id: string | null;
  legacy_import_key: string | null;
  security_id: string | null;
  type: string;
  action: string | null;
  asset_type: string | null;
  description: string | null;
  amount: string;
  price: string | null;
  units: string | null;
  fee: string;
  currency_code: string | null;
  symbol: string | null;
  trade_date: Date;
};

type DuplicateGroup = {
  key: string;
  keep: TransactionRow;
  archive: TransactionRow[];
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function normalizeNumber(value: string | number | null | undefined): string {
  if (value == null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(6) : "";
}

function normalizeDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function extractUnderlyingSymbol(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const compact = normalized.match(compactOptionPattern)?.[1];
    if (compact) return compact.toUpperCase();

    const occ = normalized.match(occOptionPattern)?.[1];
    if (occ) return occ.toUpperCase();

    const sideFirst = normalized.match(sideFirstOptionPattern)?.[2];
    if (sideFirst) return sideFirst.toUpperCase();

    const spaced = normalized.match(spacedOptionPattern)?.[1];
    if (spaced) return spaced.toUpperCase();

    if (/\bVALE\s+S\s+A\b/.test(normalized) || /\bVALE\b/.test(normalized)) {
      return "VALE";
    }
  }

  return null;
}

function isOptionEvidence(...values: Array<string | null | undefined>): boolean {
  return values.some((value) => {
    const normalized = normalizeText(value);
    return (
      compactOptionPattern.test(normalized) ||
      occOptionPattern.test(normalized) ||
      spacedOptionPattern.test(normalized) ||
      sideFirstOptionPattern.test(normalized)
    );
  });
}

function isOptionSecurity(row: SecurityRow | OptionCandidateRow): boolean {
  const symbol = "security_symbol" in row ? row.security_symbol : row.symbol;
  const description = "security_description" in row ? row.security_description : row.description;
  return (
    isOptionEvidence(symbol, row.raw_symbol, description) ||
    normalizeText(row.instrument_type_code) === "OPT" ||
    normalizeText(row.instrument_type_description).includes("OPTION")
  );
}

function isUnderlyingCandidate(security: SecurityRow, ticker: string, currency: string | null): boolean {
  if (isOptionSecurity(security)) return false;
  if (normalizeText(security.symbol) !== ticker) return false;
  return !currency || !security.currency_code || normalizeText(security.currency_code) === normalizeText(currency);
}

function findUnderlyingSecurity(
  securities: SecurityRow[],
  ticker: string,
  currency: string | null,
  excludeId?: string | null
): SecurityRow | null {
  const candidates = securities.filter(
    (security) => security.id !== excludeId && isUnderlyingCandidate(security, ticker, currency)
  );

  return (
    candidates.find((security) => normalizeText(security.currency_code) === normalizeText(currency)) ??
    candidates[0] ??
    null
  );
}

function businessKey(transaction: TransactionRow): string {
  const operation = normalizeText(transaction.action ?? transaction.type);

  return [
    transaction.account_id,
    normalizeDate(transaction.trade_date),
    operation,
    normalizeText(transaction.asset_type),
    normalizeNumber(transaction.amount),
    normalizeNumber(transaction.price),
    normalizeNumber(transaction.units),
    normalizeNumber(transaction.fee),
    normalizeText(transaction.currency_code),
    normalizeText(transaction.symbol),
  ].join("|");
}

function rowScore(transaction: TransactionRow): number {
  const description = clean(transaction.description);
  return [
    transaction.snaptrade_transaction_id ? 16 : 0,
    transaction.external_transaction_id ? 8 : 0,
    transaction.security_id ? 4 : 0,
    description && !["DIVIDEND", "INTEREST", "TRANSFER", "SPEND"].includes(normalizeText(description)) ? 4 : 0,
    transaction.source === "SNAPTRADE" ? 2 : 0,
    transaction.legacy_import_key ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

function findDuplicateGroups(rows: TransactionRow[]): DuplicateGroup[] {
  const byKey = new Map<string, TransactionRow[]>();

  for (const row of rows) {
    const key = businessKey(row);
    byKey.set(key, [...(byKey.get(key) ?? []), row]);
  }

  return [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => {
        const scoreDiff = rowScore(b) - rowScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        return a.id.localeCompare(b.id);
      });

      return {
        key,
        keep: sorted[0],
        archive: sorted.slice(1),
      };
    });
}

async function getSecurities(): Promise<SecurityRow[]> {
  return client<SecurityRow[]>`
    select
      id,
      symbol,
      raw_symbol,
      description,
      currency_code,
      instrument_type_code,
      instrument_type_description
    from securities
  `;
}

async function getOptionCandidates(): Promise<OptionCandidateRow[]> {
  return client<OptionCandidateRow[]>`
    select
      t.id as transaction_id,
      t.symbol as transaction_symbol,
      t.description as transaction_description,
      t.currency_code,
      s.id as security_id,
      s.symbol as security_symbol,
      s.raw_symbol,
      s.description as security_description,
      s.instrument_type_code,
      s.instrument_type_description
    from transactions t
    left join securities s on s.id = t.security_id
    where
      t.symbol ~* '^[A-Z]{1,6}[0-9]{1,2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
      or t.symbol ~* '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$'
      or s.symbol ~* '^[A-Z]{1,6}[0-9]{1,2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
      or s.raw_symbol ~* '^[A-Z]{1,6}[0-9]{1,2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
      or coalesce(t.description, '') ~* '\\m[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+(PUT|PUTS|CALL|CALLS)\\s+[0-9]+(\\.[0-9]+)?\\M'
      or coalesce(t.description, '') ~* '\\m(PUT|PUTS|CALL|CALLS)\\s+[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+[0-9]+(\\.[0-9]+)?\\M'
      or upper(coalesce(s.instrument_type_description, '')) like '%OPTION%'
      or upper(coalesce(s.instrument_type_code, '')) = 'OPT'
      or upper(coalesce(t.symbol, '')) = 'V005059'
      or upper(coalesce(s.symbol, '')) = 'V005059'
      or upper(coalesce(t.description, '')) like '%VALE S A%'
      or upper(coalesce(s.description, '')) like '%VALE S A%'
  `;
}

async function getActiveTransactions(): Promise<TransactionRow[]> {
  return client<TransactionRow[]>`
    select
      id,
      account_id,
      snaptrade_transaction_id,
      source,
      external_transaction_id,
      legacy_import_key,
      security_id,
      type,
      action,
      asset_type,
      description,
      amount::text,
      price::text,
      units::text,
      fee::text,
      currency_code,
      symbol,
      trade_date
    from transactions
    where is_archived = false
  `;
}

function planOptionRepairs(
  rows: OptionCandidateRow[],
  securities: SecurityRow[]
): {
  securityMoves: SecurityMovePlan[];
  transactionMoves: TransactionMovePlan[];
} {
  const securityGroups = new Map<string, OptionCandidateRow[]>();
  const transactionMoves = new Map<string, TransactionMovePlan>();

  for (const row of rows) {
    const underlyingSymbol = extractUnderlyingSymbol(
      row.transaction_symbol,
      row.security_symbol,
      row.raw_symbol,
      row.transaction_description,
      row.security_description
    );
    if (!underlyingSymbol) continue;

    if (row.security_id && row.security_symbol && isOptionSecurity(row)) {
      securityGroups.set(row.security_id, [...(securityGroups.get(row.security_id) ?? []), row]);
      continue;
    }

    if (row.transaction_id && normalizeText(row.transaction_symbol) !== underlyingSymbol) {
      const target = findUnderlyingSecurity(securities, underlyingSymbol, row.currency_code, row.security_id);
      transactionMoves.set(row.transaction_id, {
        transactionId: row.transaction_id,
        currentSymbol: row.transaction_symbol,
        underlyingSymbol,
        targetSecurityId: target?.id ?? null,
        currencyCode: row.currency_code,
      });
    }
  }

  const securityMoves = [...securityGroups.entries()]
    .map(([oldSecurityId, group]) => {
      const first = group[0];
      const underlyingSymbol = extractUnderlyingSymbol(
        first.security_symbol,
        first.raw_symbol,
        first.security_description,
        ...group.flatMap((row) => [row.transaction_symbol, row.transaction_description])
      );
      if (!underlyingSymbol) return null;

      const target = findUnderlyingSecurity(securities, underlyingSymbol, first.currency_code, oldSecurityId);
      return {
        oldSecurityId,
        oldSymbol: first.security_symbol ?? oldSecurityId,
        underlyingSymbol,
        targetSecurityId: target?.id ?? null,
        currencyCode: first.currency_code,
        transactionCount: group.length,
      };
    })
    .filter((plan): plan is SecurityMovePlan => Boolean(plan));

  return { securityMoves, transactionMoves: [...transactionMoves.values()] };
}

async function ensureUnderlyingSecurity(
  tx: postgres.TransactionSql<Record<string, postgres.PostgresType>>,
  ticker: string,
  currencyCode: string | null
): Promise<string> {
  const currency = currencyCode ? normalizeText(currencyCode).slice(0, 10) : null;
  const securityKey = `manual-underlying:${ticker}:${currency ?? "unknown"}`;
  const [row] = await tx<Array<{ id: string }>>`
    insert into securities (
      security_key,
      symbol,
      raw_symbol,
      description,
      currency_code,
      instrument_type_code,
      instrument_type_description,
      updated_at
    )
    values (
      ${securityKey},
      ${ticker},
      ${ticker},
      ${ticker},
      ${currency},
      null,
      null,
      now()
    )
    on conflict (security_key) do update
      set symbol = excluded.symbol,
          raw_symbol = excluded.raw_symbol,
          updated_at = now()
    returning id
  `;

  return row.id;
}

function projectTransactions(
  rows: TransactionRow[],
  securityMoves: SecurityMovePlan[],
  transactionMoves: TransactionMovePlan[]
): TransactionRow[] {
  const underlyingByOldSecurity = new Map(
    securityMoves.map((plan) => [plan.oldSecurityId, plan.underlyingSymbol])
  );
  const underlyingByTransaction = new Map(
    transactionMoves.map((plan) => [plan.transactionId, plan.underlyingSymbol])
  );

  return rows.map((row) => {
    const underlying =
      underlyingByTransaction.get(row.id) ??
      (row.security_id ? underlyingByOldSecurity.get(row.security_id) : undefined);
    if (!underlying) return row;

    return {
      ...row,
      symbol: underlying,
      asset_type: isOptionEvidence(row.symbol, row.description) ? "OPTION" : row.asset_type,
    };
  });
}

function printPlan(
  securityMoves: SecurityMovePlan[],
  transactionMoves: TransactionMovePlan[],
  duplicateGroups: DuplicateGroup[],
  wrongOptionAssetCount: number
) {
  const duplicateCount = duplicateGroups.reduce((sum, group) => sum + group.archive.length, 0);
  console.log(
    JSON.stringify(
      {
        optionSecurityMoves: securityMoves.length,
        optionTransactionSymbolMoves: transactionMoves.length,
        wrongOptionAssetTypesToRepair: wrongOptionAssetCount,
        duplicateGroups: duplicateGroups.length,
        transactionsToArchive: duplicateCount,
        optionExamples: securityMoves.slice(0, 30),
        symbolExamples: transactionMoves.slice(0, 30),
        duplicateExamples: duplicateGroups.slice(0, 20).map((group) => ({
          keep: {
            id: group.keep.id,
            date: group.keep.trade_date.toISOString().slice(0, 10),
            symbol: group.keep.symbol,
            action: group.keep.action,
            amount: group.keep.amount,
            units: group.keep.units,
            price: group.keep.price,
            description: group.keep.description,
          },
          archiveIds: group.archive.map((row) => row.id),
        })),
      },
      null,
      2
    )
  );
}

async function getWrongOptionAssetCount(): Promise<number> {
  const [row] = await client<Array<{ count: string }>>`
    select count(*)::text as count
    from transactions t
    left join securities s on s.id = t.security_id
    where t.asset_type = 'OPTION'
      and not (
        coalesce(t.symbol, '') ~* '^[A-Z]{1,6}[0-9]{1,2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
        or coalesce(t.symbol, '') ~* '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$'
        or coalesce(t.description, '') ~* '\\m[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+(PUT|PUTS|CALL|CALLS)\\s+[0-9]+(\\.[0-9]+)?\\M'
        or coalesce(t.description, '') ~* '\\m(PUT|PUTS|CALL|CALLS)\\s+[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+[0-9]+(\\.[0-9]+)?\\M'
        or upper(coalesce(s.instrument_type_code, '')) = 'OPT'
      )
  `;
  return Number(row?.count ?? 0);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const allowLegacyOptionFlattening = process.argv.includes("--legacy-flatten-options");
  const securities = await getSecurities();
  const optionRows = await getOptionCandidates();
  const plannedOptionRepairs = allowLegacyOptionFlattening
    ? planOptionRepairs(optionRows, securities)
    : { securityMoves: [], transactionMoves: [] };
  const { securityMoves, transactionMoves } = plannedOptionRepairs;
  const activeTransactions = await getActiveTransactions();
  const projectedTransactions = projectTransactions(activeTransactions, securityMoves, transactionMoves);
  const duplicateGroups = findDuplicateGroups(projectedTransactions);
  const wrongOptionAssetCount = allowLegacyOptionFlattening ? await getWrongOptionAssetCount() : 0;

  if (!allowLegacyOptionFlattening) {
    console.log(
      "Option flattening skipped. The SQLite importer now creates option contract securities; pass --legacy-flatten-options to run the old repair."
    );
  }

  printPlan(securityMoves, transactionMoves, duplicateGroups, wrongOptionAssetCount);

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to archive duplicate transactions.");
    await client.end();
    return;
  }

  await client.begin(async (tx) => {
    const targetCache = new Map<string, string>();
    const getTargetId = async (ticker: string, targetSecurityId: string | null, currencyCode: string | null) => {
      if (targetSecurityId) return targetSecurityId;
      const key = `${ticker}|${currencyCode ?? ""}`;
      const cached = targetCache.get(key);
      if (cached) return cached;
      const created = await ensureUnderlyingSecurity(tx, ticker, currencyCode);
      targetCache.set(key, created);
      return created;
    };

    if (allowLegacyOptionFlattening) {
      for (const plan of securityMoves) {
        const targetId = await getTargetId(
          plan.underlyingSymbol,
          plan.targetSecurityId,
          plan.currencyCode
        );
        await tx`
          update transactions
          set
            security_id = ${targetId},
            symbol = ${plan.underlyingSymbol},
            asset_type = 'OPTION'
          where security_id = ${plan.oldSecurityId}
        `;
      }

      for (const plan of transactionMoves) {
        const targetId = await getTargetId(
          plan.underlyingSymbol,
          plan.targetSecurityId,
          plan.currencyCode
        );
        await tx`
          update transactions
          set
            security_id = ${targetId},
            symbol = ${plan.underlyingSymbol},
            asset_type = case
              when (
                coalesce(symbol, '') ~* '^[A-Z]{1,6}[0-9]{1,2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
                or coalesce(description, '') ~* '\\m[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+(PUT|PUTS|CALL|CALLS)\\s+[0-9]+(\\.[0-9]+)?\\M'
                or coalesce(description, '') ~* '\\m(PUT|PUTS|CALL|CALLS)\\s+[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+[0-9]+(\\.[0-9]+)?\\M'
              ) then 'OPTION'
              else asset_type
            end
          where id = ${plan.transactionId}
        `;
      }

      await tx`
        update transactions t
        set asset_type = case
          when t.action = 'INTEREST' then 'INTEREST'
          when upper(coalesce(s.instrument_type_description, '')) like '%ETF%' then 'ETF'
          when upper(coalesce(s.instrument_type_description, '')) like '%COMMON STOCK%'
            or upper(coalesce(s.instrument_type_description, '')) like '%DEPOSITARY%'
            or upper(coalesce(s.instrument_type_description, '')) like '%EQUITY%'
            or upper(coalesce(s.instrument_type_code, '')) in ('CS', 'EQUITY') then 'STOCK'
          when t.action in ('DEPOSIT', 'WITHDRAWAL', 'CONTRIBUTION', 'TRANSFER', 'FEE', 'REIMBURSEMENT', 'SPEND') then 'CASH'
          else 'OTHER'
        end
        from securities s
        where s.id = t.security_id
          and t.asset_type = 'OPTION'
          and not (
            coalesce(t.symbol, '') ~* '^[A-Z]{1,6}[0-9]{1,2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
            or coalesce(t.symbol, '') ~* '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$'
            or coalesce(t.description, '') ~* '\\m[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+(PUT|PUTS|CALL|CALLS)\\s+[0-9]+(\\.[0-9]+)?\\M'
            or coalesce(t.description, '') ~* '\\m(PUT|PUTS|CALL|CALLS)\\s+[A-Z]{1,6}\\s+([0-9]{1,2}[A-Z]{3}[0-9]{2}|[0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{1,2}/[0-9]{1,2}/[0-9]{2,4})\\s+[0-9]+(\\.[0-9]+)?\\M'
            or upper(coalesce(s.instrument_type_code, '')) = 'OPT'
          )
      `;
    }

    const idsToArchive = duplicateGroups.flatMap((group) => group.archive.map((row) => row.id));
    if (idsToArchive.length > 0) {
      await tx`
        update transactions
        set is_archived = true
        where id in ${tx(idsToArchive)}
      `;
    }
  });

  console.log(
    `Moved ${securityMoves.length} option securities, fixed ${transactionMoves.length} transaction symbols, repaired ${wrongOptionAssetCount} wrong option asset types, and archived ${duplicateGroups.reduce(
      (sum, group) => sum + group.archive.length,
      0
    )} duplicate transactions.`
  );
  await client.end();
}

main().catch((error) => {
  console.error(error);
  void client.end();
  process.exitCode = 1;
});
