import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);
const apply = process.argv.includes("--apply");

const successorSymbols: Record<string, string> = {
  SQ: "XYZ",
};

const months: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

type SqCandidateRow = {
  transaction_id: string;
  transaction_symbol: string | null;
  transaction_description: string | null;
  transaction_action: string | null;
  transaction_asset_type: string | null;
  transaction_option_id: string | null;
  transaction_security_id: string | null;
  transaction_underlying_security_id: string | null;
  security_symbol: string | null;
  security_raw_symbol: string | null;
  security_description: string | null;
  security_type_code: string | null;
  security_type_description: string | null;
  underlying_symbol: string | null;
  option_id: string | null;
  option_ticker: string | null;
};

type ParsedOption = {
  displayUnderlyingSymbol: string;
  canonicalUnderlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  description: string;
};

type SqOptionRepair = ParsedOption & {
  transactionId: string;
  securityId: string | null;
  optionId: string | null;
};

type SqStockRepair = {
  transactionId: string;
};

type SqStockSecurityMerge = {
  id: string;
  symbol: string;
  description: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function canonicalSymbol(symbol: string): string {
  const normalized = symbol.toUpperCase();
  return successorSymbols[normalized] ?? normalized;
}

function optionSide(value: string): "CALL" | "PUT" {
  return normalizeText(value).startsWith("C") ? "CALL" : "PUT";
}

function parseDate(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[1].padStart(2, "0")}-${slash[2].padStart(2, "0")}`;
  }

  const named = normalized.match(/^(\d{1,2})([A-Z]{3})(\d{2})$/);
  if (named) {
    const month = months[named[2]];
    if (!month) return null;
    return `20${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }

  return null;
}

function parsedOption(input: {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
}): ParsedOption {
  const displayUnderlyingSymbol = input.underlyingSymbol.toUpperCase();
  const strikePrice = Number(input.strikePrice).toString();

  return {
    displayUnderlyingSymbol,
    canonicalUnderlyingSymbol: canonicalSymbol(displayUnderlyingSymbol),
    expirationDate: input.expirationDate,
    contractType: input.contractType,
    strikePrice,
    description: `${displayUnderlyingSymbol} ${input.expirationDate} ${input.contractType} ${strikePrice}`,
  };
}

function parseOptionDetails(...values: Array<string | null | undefined>): ParsedOption | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const occ = normalized.replace(/\s+/g, "").match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
    if (occ) {
      return parsedOption({
        underlyingSymbol: occ[1],
        expirationDate: `20${occ[2]}-${occ[3]}-${occ[4]}`,
        contractType: occ[5] === "C" ? "CALL" : "PUT",
        strikePrice: (Number(occ[6]) / 1000).toString(),
      });
    }

    const named = normalized.match(/^([A-Z]{1,6})(\d{1,2})([A-Z]{3})(\d{2})([CP])(\d+(?:\.\d+)?)$/);
    if (named) {
      const expirationDate = parseDate(`${named[2]}${named[3]}${named[4]}`);
      if (!expirationDate) continue;
      return parsedOption({
        underlyingSymbol: named[1],
        expirationDate,
        contractType: named[5] === "C" ? "CALL" : "PUT",
        strikePrice: named[6],
      });
    }

    const spaced = normalized.match(
      /\b([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(PUTS?|CALLS?)\s+(\d+(?:\.\d+)?)\b/
    );
    if (spaced) {
      const expirationDate = parseDate(spaced[2]);
      if (!expirationDate) continue;
      return parsedOption({
        underlyingSymbol: spaced[1],
        expirationDate,
        contractType: optionSide(spaced[3]),
        strikePrice: spaced[4],
      });
    }

    const sideFirst = normalized.match(
      /\b(PUTS?|CALLS?)\s+([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d+(?:\.\d+)?)\b/
    );
    if (sideFirst) {
      const expirationDate = parseDate(sideFirst[3]);
      if (!expirationDate) continue;
      return parsedOption({
        underlyingSymbol: sideFirst[2],
        expirationDate,
        contractType: optionSide(sideFirst[1]),
        strikePrice: sideFirst[4],
      });
    }
  }

  return null;
}

function isOptionTyped(row: SqCandidateRow): boolean {
  return (
    row.transaction_option_id != null ||
    row.option_id != null ||
    parseOptionDetails(row.option_ticker, row.transaction_symbol, row.transaction_description) != null
  );
}

async function ensureUnderlyingSecurity(
  tx: postgres.TransactionSql<Record<string, postgres.PostgresType>>,
  symbol: string
): Promise<string> {
  const [existing] = await tx<Array<{ id: string }>>`
    select id
    from securities
    where upper(symbol) = ${symbol}
      and upper(coalesce(instrument_type_description, '')) not like '%OPTION%'
      and upper(coalesce(instrument_type_code, '')) <> 'OPTION'
    order by
      case when source = 'SNAPTRADE' then 0 else 1 end,
      created_at asc
    limit 1
  `;

  if (existing) return existing.id;

  const [created] = await tx<Array<{ id: string }>>`
    insert into securities (
      security_key,
      source,
      symbol,
      raw_symbol,
      description,
      instrument_type_code,
      instrument_type_description,
      updated_at
    )
    values (
      ${`manual-underlying:${symbol}:unknown`},
      'Manual Repair',
      ${symbol},
      ${symbol},
      ${symbol},
      'STOCK',
      'STOCK',
      now()
    )
    on conflict (security_key) do update
      set symbol = excluded.symbol,
          raw_symbol = excluded.raw_symbol,
          updated_at = now()
    returning id
  `;

  return created.id;
}

async function getSqCandidates(): Promise<SqCandidateRow[]> {
  return client<SqCandidateRow[]>`
    select
      t.id as transaction_id,
      t.symbol as transaction_symbol,
      t.description as transaction_description,
      t.action as transaction_action,
      t.asset_type as transaction_asset_type,
      t.option_id as transaction_option_id,
      t.security_id as transaction_security_id,
      t.underlying_security_id as transaction_underlying_security_id,
      s.symbol as security_symbol,
      s.raw_symbol as security_raw_symbol,
      s.description as security_description,
      s.instrument_type_code as security_type_code,
      s.instrument_type_description as security_type_description,
      us.symbol as underlying_symbol,
      o.id as option_id,
      o.ticker as option_ticker
    from transactions t
    left join securities s on s.id = t.security_id
    left join securities us on us.id = t.underlying_security_id
    left join options o on o.id = t.option_id
    where
      upper(coalesce(t.symbol, '')) like 'SQ%'
      or upper(coalesce(t.description, '')) like '%SQ%'
      or upper(coalesce(s.symbol, '')) like 'SQ%'
      or upper(coalesce(s.raw_symbol, '')) like 'SQ%'
      or upper(coalesce(s.description, '')) like 'SQ %'
      or upper(coalesce(o.ticker, '')) like 'SQ%'
  `;
}

function planSqOptionRepairs(rows: SqCandidateRow[]): SqOptionRepair[] {
  const repairs = new Map<string, SqOptionRepair>();

  for (const row of rows) {
    const details = parseOptionDetails(
      row.option_ticker,
      row.security_description,
      row.security_symbol,
      row.security_raw_symbol,
      row.transaction_symbol,
      row.transaction_description
    );
    if (!details || details.displayUnderlyingSymbol !== "SQ" || !isOptionTyped(row)) continue;
    if (
      normalizeText(row.transaction_symbol) === details.canonicalUnderlyingSymbol &&
      normalizeText(row.transaction_description) === details.description &&
      normalizeText(row.underlying_symbol) === details.canonicalUnderlyingSymbol &&
      normalizeText(row.security_symbol) === details.canonicalUnderlyingSymbol
    ) {
      continue;
    }

    repairs.set(row.transaction_id, {
      ...details,
      transactionId: row.transaction_id,
      securityId: row.transaction_security_id,
      optionId: row.transaction_option_id ?? row.option_id,
    });
  }

  return [...repairs.values()];
}

function planSqStockRepairs(rows: SqCandidateRow[]): SqStockRepair[] {
  return rows
    .filter((row) => {
      if (normalizeText(row.transaction_symbol) !== "SQ") return false;
      if (row.transaction_option_id || row.option_id) return false;
      if (parseOptionDetails(row.transaction_description, row.transaction_symbol)) {
        return false;
      }

      return ["BUY", "SELL"].includes(normalizeText(row.transaction_action));
    })
    .map((row) => ({ transactionId: row.transaction_id }));
}

async function getNegativeTransfers(): Promise<Array<{ id: string; amount: string }>> {
  return client<Array<{ id: string; amount: string }>>`
    select id, amount::text
    from transactions
    where upper(coalesce(action, '')) = 'TRANSFER'
      and amount < 0
  `;
}

async function getSqStockSecurities(): Promise<SqStockSecurityMerge[]> {
  return client<SqStockSecurityMerge[]>`
    select id, symbol, description
    from securities
    where upper(symbol) = 'SQ'
      and upper(coalesce(instrument_type_description, '')) not like '%OPTION%'
      and upper(coalesce(instrument_type_code, '')) <> 'OPTION'
  `;
}

async function main() {
  const rows = await getSqCandidates();
  const optionRepairs = planSqOptionRepairs(rows);
  const stockRepairs = planSqStockRepairs(rows);
  const negativeTransfers = await getNegativeTransfers();
  const sqStockSecurities = await getSqStockSecurities();

  console.log(
    JSON.stringify(
      {
        apply,
        sqOptionTransactionsToNormalize: optionRepairs.length,
        sqStockTransactionsToNormalize: stockRepairs.length,
        sqStockSecuritiesToMerge: sqStockSecurities.length,
        negativeTransfersToZero: negativeTransfers.length,
        optionExamples: optionRepairs.slice(0, 10).map((row) => ({
          id: row.transactionId,
          symbol: row.canonicalUnderlyingSymbol,
          description: row.description,
        })),
        stockExamples: stockRepairs.slice(0, 10),
        sqStockSecurityExamples: sqStockSecurities.slice(0, 10),
        transferExamples: negativeTransfers.slice(0, 10),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to repair symbol and transfer values.");
    return;
  }

  await client.begin(async (tx) => {
    const xyzSecurityId = await ensureUnderlyingSecurity(tx, "XYZ");
    const optionIds = [...new Set(optionRepairs.map((row) => row.optionId).filter(Boolean))] as string[];
    const optionSecurityIds = [...new Set(optionRepairs.map((row) => row.securityId).filter(Boolean))] as string[];

    for (const repair of optionRepairs) {
      await tx`
        update transactions
        set
          security_id = ${xyzSecurityId},
          symbol = ${repair.canonicalUnderlyingSymbol},
          underlying_security_id = ${xyzSecurityId},
          asset_type = 'OPTION',
          description = ${repair.description}
        where id = ${repair.transactionId}
      `;
    }

    for (const repair of stockRepairs) {
      await tx`
        update transactions
        set
          symbol = 'XYZ',
          security_id = ${xyzSecurityId},
          underlying_security_id = ${xyzSecurityId},
          asset_type = 'STOCK'
        where id = ${repair.transactionId}
      `;
    }

    if (optionIds.length > 0) {
      await tx`
        update options
        set underlying_security_id = ${xyzSecurityId}, updated_at = now()
        where id in ${tx(optionIds)}
      `;
    }

    if (sqStockSecurities.length > 0) {
      const sqStockSecurityIds = sqStockSecurities.map((row) => row.id);

      await tx`
        update transactions
        set
          security_id = case when security_id in ${tx(sqStockSecurityIds)} then ${xyzSecurityId} else security_id end,
          underlying_security_id = case when underlying_security_id in ${tx(sqStockSecurityIds)} then ${xyzSecurityId} else underlying_security_id end,
          symbol = case when upper(coalesce(symbol, '')) = 'SQ' then 'XYZ' else symbol end
        where security_id in ${tx(sqStockSecurityIds)}
           or underlying_security_id in ${tx(sqStockSecurityIds)}
           or upper(coalesce(symbol, '')) = 'SQ'
      `;

      await tx`
        update options
        set underlying_security_id = ${xyzSecurityId}, updated_at = now()
        where underlying_security_id in ${tx(sqStockSecurityIds)}
      `;

      await tx`
        update security_aliases
        set security_id = ${xyzSecurityId}, updated_at = now()
        where security_id in ${tx(sqStockSecurityIds)}
      `;

      await tx`
        delete from securities s
        where s.id in ${tx(sqStockSecurityIds)}
          and not exists (
            select 1 from transactions t
            where t.security_id = s.id
               or t.underlying_security_id = s.id
          )
          and not exists (
            select 1 from options o
            where o.security_id = s.id
               or o.underlying_security_id = s.id
          )
          and not exists (
            select 1 from security_aliases a
            where a.security_id = s.id
          )
      `;
    }

    for (const securityId of optionSecurityIds) {
      const detail = optionRepairs.find((row) => row.securityId === securityId);
      if (!detail) continue;
      await tx`
        update securities
        set
          description = ${detail.description},
          instrument_type_code = 'OPTION',
          instrument_type_description = 'OPTION',
          updated_at = now()
        where id = ${securityId}
      `;
    }

    if (negativeTransfers.length > 0) {
      await tx`
        update transactions
        set amount = 0
        where id in ${tx(negativeTransfers.map((row) => row.id))}
      `;
    }
  });

  console.log("Symbol and transfer value repairs applied.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
