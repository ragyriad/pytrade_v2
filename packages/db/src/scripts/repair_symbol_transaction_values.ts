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

const knownEtfSymbols = new Set([
  "ARKF",
  "DLR.TO",
  "DLR.U.TO",
  "FHLC",
  "HDV",
  "ICLN",
  "IYT",
  "KBWD",
  "SGOV",
  "URNM",
  "XLP",
  "XLU",
]);

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

type OptionCandidateRow = {
  transaction_id: string;
  account_id: string;
  snaptrade_transaction_id: string | null;
  source: string;
  external_transaction_id: string | null;
  legacy_import_key: string | null;
  transaction_symbol: string | null;
  transaction_description: string | null;
  transaction_type: string | null;
  transaction_action: string | null;
  transaction_asset_type: string | null;
  transaction_option_id: string | null;
  transaction_security_id: string | null;
  transaction_underlying_security_id: string | null;
  transaction_currency_code: string | null;
  transaction_trade_date: Date | string;
  amount: string;
  price: string | null;
  units: string | null;
  fee: string;
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
  ticker: string;
  description: string;
};

type OptionRepair = ParsedOption & {
  transactionId: string;
  currentSecurityId: string | null;
  currentOptionId: string | null;
  currencyCode: string | null;
  tradeDate: Date | string;
};

type StockRepair = {
  transactionId: string;
};

type SqStockSecurityMerge = {
  id: string;
  symbol: string;
  description: string | null;
};

type DuplicateTransactionRow = {
  id: string;
  account_id: string;
  snaptrade_transaction_id: string | null;
  source: string;
  external_transaction_id: string | null;
  legacy_import_key: string | null;
  security_id: string | null;
  underlying_security_id: string | null;
  option_id: string | null;
  trade_date: Date | string;
  type: string | null;
  action: string | null;
  asset_type: string | null;
  symbol: string | null;
  description: string | null;
  amount: string;
  price: string | null;
  units: string | null;
  fee: string;
  currency_code: string | null;
  option_ticker: string | null;
};

type SqlExecutor = {
  <T extends readonly object[] = Record<string, unknown>[]>(
    strings: TemplateStringsArray,
    ...parameters: unknown[]
  ): Promise<T>;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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

function formatOccOptionTicker(input: {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
}): string {
  const [year, month, day] = input.expirationDate.split("-");
  const side = input.contractType === "CALL" ? "C" : "P";
  const strike = Math.round(Number(input.strikePrice) * 1000)
    .toString()
    .padStart(8, "0");
  return `${input.underlyingSymbol}${year.slice(2)}${month}${day}${side}${strike}`;
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
    ticker: formatOccOptionTicker({
      underlyingSymbol: displayUnderlyingSymbol,
      expirationDate: input.expirationDate,
      contractType: input.contractType,
      strikePrice,
    }),
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

function isOptionTyped(row: OptionCandidateRow): boolean {
  return (
    row.transaction_option_id != null ||
    row.option_id != null ||
    normalizeText(row.transaction_asset_type) === "OPTION" ||
    normalizeText(row.transaction_type) === "OPTION" ||
    parseOptionDetails(row.option_ticker, row.transaction_symbol, row.transaction_description) != null
  );
}

async function ensureUnderlyingSecurity(
  tx: postgres.TransactionSql<Record<string, postgres.PostgresType>>,
  symbol: string,
  currencyCode: string | null,
  seenAt: Date | string
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

  const instrumentType = knownEtfSymbols.has(symbol) ? "ETF" : "STOCK";
  const [created] = await tx<Array<{ id: string }>>`
    insert into securities (
      security_key,
      source,
      symbol,
      raw_symbol,
      description,
      currency_code,
      instrument_type_code,
      instrument_type_description,
      first_seen_at,
      last_seen_at,
      updated_at
    )
    values (
      ${`manual-underlying:${symbol}:${currencyCode ?? "unknown"}`},
      'Manual Repair',
      ${symbol},
      ${symbol},
      ${symbol},
      ${currencyCode},
      ${instrumentType},
      ${instrumentType},
      ${seenAt},
      ${seenAt},
      now()
    )
    on conflict (security_key) do update
      set symbol = excluded.symbol,
          raw_symbol = excluded.raw_symbol,
          instrument_type_code = excluded.instrument_type_code,
          instrument_type_description = excluded.instrument_type_description,
          updated_at = now()
    returning id
  `;

  return created.id;
}

async function ensureOptionContract(
  tx: postgres.TransactionSql<Record<string, postgres.PostgresType>>,
  repair: OptionRepair,
  underlyingSecurityId: string
): Promise<{ optionId: string; contractSecurityId: string }> {
  const [existingOption] = await tx<Array<{ id: string; security_id: string }>>`
    select id, security_id
    from options
    where ticker = ${repair.ticker}
    limit 1
  `;

  if (existingOption) {
    await tx`
      update options
      set
        underlying_security_id = ${underlyingSecurityId},
        contract_type = ${repair.contractType},
        strike_price = ${repair.strikePrice},
        expiration_date = ${repair.expirationDate},
        status = 'closed',
        updated_at = now()
      where id = ${existingOption.id}
    `;
    return {
      optionId: existingOption.id,
      contractSecurityId: existingOption.security_id,
    };
  }

  const [existingSecurity] = await tx<Array<{ id: string }>>`
    select id
    from securities
    where security_key = ${`option:${repair.ticker}`}
       or upper(symbol) = ${repair.ticker}
    order by case when security_key = ${`option:${repair.ticker}`} then 0 else 1 end
    limit 1
  `;

  const contractSecurityId =
    existingSecurity?.id ??
    (
      await tx<Array<{ id: string }>>`
        insert into securities (
          security_key,
          source,
          symbol,
          raw_symbol,
          description,
          currency_code,
          instrument_type_code,
          instrument_type_description,
          first_seen_at,
          last_seen_at,
          updated_at
        )
        values (
          ${`option:${repair.ticker}`},
          'Manual Repair',
          ${repair.ticker},
          ${repair.ticker},
          ${repair.description},
          ${repair.currencyCode},
          'OPTION',
          'OPTION',
          ${repair.tradeDate},
          ${repair.tradeDate},
          now()
        )
        on conflict (security_key) do update
          set description = excluded.description,
              instrument_type_code = 'OPTION',
              instrument_type_description = 'OPTION',
              updated_at = now()
        returning id
      `
    )[0].id;

  await tx`
    update securities
    set
      description = ${repair.description},
      instrument_type_code = 'OPTION',
      instrument_type_description = 'OPTION',
      updated_at = now()
    where id = ${contractSecurityId}
  `;

  const [option] = await tx<Array<{ id: string }>>`
    insert into options (
      security_id,
      underlying_security_id,
      ticker,
      contract_type,
      strike_price,
      expiration_date,
      multiplier,
      status,
      is_mini_option,
      raw_data,
      first_seen_at,
      last_seen_at,
      updated_at
    )
    values (
      ${contractSecurityId},
      ${underlyingSecurityId},
      ${repair.ticker},
      ${repair.contractType},
      ${repair.strikePrice},
      ${repair.expirationDate},
      '100',
      'closed',
      false,
      ${tx.json({ source: "Manual Repair", description: repair.description })},
      ${repair.tradeDate},
      ${repair.tradeDate},
      now()
    )
    on conflict (ticker) do update
      set underlying_security_id = excluded.underlying_security_id,
          contract_type = excluded.contract_type,
          strike_price = excluded.strike_price,
          expiration_date = excluded.expiration_date,
          status = excluded.status,
          updated_at = now()
    returning id
  `;

  return { optionId: option.id, contractSecurityId };
}

async function getOptionCandidates(): Promise<OptionCandidateRow[]> {
  return client<OptionCandidateRow[]>`
    select
      t.id as transaction_id,
      t.account_id,
      t.snaptrade_transaction_id,
      t.source,
      t.external_transaction_id,
      t.legacy_import_key,
      t.symbol as transaction_symbol,
      t.description as transaction_description,
      t.type as transaction_type,
      t.action as transaction_action,
      t.asset_type as transaction_asset_type,
      t.option_id as transaction_option_id,
      t.security_id as transaction_security_id,
      t.underlying_security_id as transaction_underlying_security_id,
      t.currency_code as transaction_currency_code,
      t.trade_date as transaction_trade_date,
      t.amount::text,
      t.price::text,
      t.units::text,
      t.fee::text,
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
      t.option_id is not null
      or upper(coalesce(t.asset_type, '')) = 'OPTION'
      or upper(coalesce(t.type, '')) = 'OPTION'
      or upper(coalesce(t.description, '')) like '%PUT%'
      or upper(coalesce(t.description, '')) like '%CALL%'
      or upper(coalesce(t.symbol, '')) like 'SQ%'
      or upper(coalesce(s.symbol, '')) like 'SQ%'
      or upper(coalesce(s.raw_symbol, '')) like 'SQ%'
      or upper(coalesce(s.symbol, '')) ~ '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$'
      or upper(coalesce(o.ticker, '')) ~ '^[A-Z]{1,6}[0-9]{6}[CP][0-9]{8}$'
  `;
}

function planOptionRepairs(rows: OptionCandidateRow[]): OptionRepair[] {
  const repairs = new Map<string, OptionRepair>();

  for (const row of rows) {
    const details = parseOptionDetails(
      row.option_ticker,
      row.security_description,
      row.security_symbol,
      row.security_raw_symbol,
      row.transaction_symbol,
      row.transaction_description
    );
    if (!details || !isOptionTyped(row)) continue;

    const alreadyNormalized =
      normalizeText(row.transaction_symbol) === details.canonicalUnderlyingSymbol &&
      normalizeText(row.transaction_description) === details.description &&
      normalizeText(row.underlying_symbol) === details.canonicalUnderlyingSymbol &&
      normalizeText(row.security_symbol) === details.canonicalUnderlyingSymbol &&
      row.transaction_option_id != null;

    if (alreadyNormalized) continue;

    repairs.set(row.transaction_id, {
      ...details,
      transactionId: row.transaction_id,
      currentSecurityId: row.transaction_security_id,
      currentOptionId: row.transaction_option_id ?? row.option_id,
      currencyCode: row.transaction_currency_code,
      tradeDate: row.transaction_trade_date,
    });
  }

  return [...repairs.values()];
}

async function getSqStockTransactions(): Promise<StockRepair[]> {
  const rows = await client<Array<{ id: string }>>`
    select t.id
    from transactions t
    where upper(coalesce(t.symbol, '')) = 'SQ'
      and t.option_id is null
      and upper(coalesce(t.asset_type, '')) <> 'OPTION'
      and upper(coalesce(t.type, '')) <> 'OPTION'
  `;

  return rows.map((row) => ({ transactionId: row.id }));
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

function dateKey(date: Date | string): string {
  const parsed = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function decimalKey(value: string | number | null | undefined, scale = 6): string {
  if (value == null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(scale) : "";
}

function duplicateSymbol(row: Pick<DuplicateTransactionRow, "symbol" | "description" | "option_ticker">): string {
  const details = parseOptionDetails(row.option_ticker, row.symbol, row.description);
  return normalizeText(details?.canonicalUnderlyingSymbol ?? row.symbol ?? "");
}

function duplicateTransactionKey(transaction: DuplicateTransactionRow): string {
  return [
    transaction.account_id,
    dateKey(transaction.trade_date),
    normalizeText(transaction.type),
    normalizeText(transaction.action),
    normalizeText(transaction.asset_type),
    decimalKey(transaction.amount),
    decimalKey(transaction.price),
    decimalKey(transaction.units),
    decimalKey(transaction.fee),
    normalizeText(transaction.currency_code),
    duplicateSymbol(transaction),
  ].join("|");
}

function transactionScore(transaction: DuplicateTransactionRow): number {
  return [
    transaction.snaptrade_transaction_id ? 16 : 0,
    transaction.security_id ? 4 : 0,
    transaction.underlying_security_id ? 3 : 0,
    transaction.option_id ? 2 : 0,
    transaction.source === "SNAPTRADE" ? 2 : 0,
    transaction.external_transaction_id ? 1 : 0,
    transaction.legacy_import_key ? 1 : 0,
  ].reduce((sum, value) => sum + value, 0);
}

async function getDuplicateRows(sqlExecutor: SqlExecutor): Promise<DuplicateTransactionRow[]> {
  return sqlExecutor<DuplicateTransactionRow[]>`
    select
      t.id,
      t.account_id,
      t.snaptrade_transaction_id,
      t.source,
      t.external_transaction_id,
      t.legacy_import_key,
      t.security_id,
      t.underlying_security_id,
      t.option_id,
      t.trade_date,
      t.type,
      t.action,
      t.asset_type,
      t.symbol,
      t.description,
      t.amount::text,
      t.price::text,
      t.units::text,
      t.fee::text,
      t.currency_code,
      o.ticker as option_ticker
    from transactions t
    left join options o on o.id = t.option_id
    where t.is_archived = false
  `;
}

function planDuplicateArchives(rows: DuplicateTransactionRow[]): string[] {
  const groups = new Map<string, DuplicateTransactionRow[]>();

  for (const row of rows) {
    const key = duplicateTransactionKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.values()]
    .filter((group) => group.length > 1)
    .flatMap((group) =>
      [...group]
        .sort((a, b) => {
          const scoreDifference = transactionScore(b) - transactionScore(a);
          if (scoreDifference !== 0) return scoreDifference;
          return a.id.localeCompare(b.id);
        })
        .slice(1)
        .map((row) => row.id)
    );
}

async function archiveExactDuplicateTransactions(
  tx: postgres.TransactionSql<Record<string, postgres.PostgresType>>
): Promise<number> {
  const archiveIds = planDuplicateArchives(await getDuplicateRows(tx));

  if (archiveIds.length > 0) {
    await tx`
      update transactions
      set is_archived = true
      where id in ${tx(archiveIds)}
    `;
  }

  return archiveIds.length;
}

async function main() {
  const optionRepairs = planOptionRepairs(await getOptionCandidates());
  const stockRepairs = await getSqStockTransactions();
  const negativeTransfers = await getNegativeTransfers();
  const sqStockSecurities = await getSqStockSecurities();
  const duplicateArchiveIds = planDuplicateArchives(await getDuplicateRows(client));

  console.log(
    JSON.stringify(
      {
        apply,
        optionTransactionsToNormalize: optionRepairs.length,
        sqStockTransactionsToNormalize: stockRepairs.length,
        sqStockSecuritiesToMerge: sqStockSecurities.length,
        negativeTransfersToZero: negativeTransfers.length,
        currentlyDuplicateTransactionsToArchive: duplicateArchiveIds.length,
        optionExamples: optionRepairs.slice(0, 12).map((row) => ({
          id: row.transactionId,
          symbol: row.canonicalUnderlyingSymbol,
          ticker: row.ticker,
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
    console.log("Dry run only. Re-run with --apply to repair option symbols and duplicate transactions.");
    return;
  }

  let archivedDuplicates = 0;

  await client.begin(async (tx) => {
    const underlyingSecurityIds = new Map<string, string>();

    async function ensureUnderlyingForRepair(repair: OptionRepair): Promise<string> {
      const cached = underlyingSecurityIds.get(repair.canonicalUnderlyingSymbol);
      if (cached) return cached;

      const id = await ensureUnderlyingSecurity(
        tx,
        repair.canonicalUnderlyingSymbol,
        repair.currencyCode,
        repair.tradeDate
      );
      underlyingSecurityIds.set(repair.canonicalUnderlyingSymbol, id);
      return id;
    }

    for (const repair of optionRepairs) {
      const underlyingSecurityId = await ensureUnderlyingForRepair(repair);
      const option = await ensureOptionContract(tx, repair, underlyingSecurityId);

      await tx`
        update transactions
        set
          security_id = ${underlyingSecurityId},
          underlying_security_id = ${underlyingSecurityId},
          option_id = ${option.optionId},
          symbol = ${repair.canonicalUnderlyingSymbol},
          asset_type = 'OPTION',
          description = ${repair.description}
        where id = ${repair.transactionId}
      `;
    }

    if (stockRepairs.length > 0 || sqStockSecurities.length > 0) {
      const xyzSecurityId =
        underlyingSecurityIds.get("XYZ") ??
        (await ensureUnderlyingSecurity(tx, "XYZ", "USD", new Date()));
      underlyingSecurityIds.set("XYZ", xyzSecurityId);

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
    }

    if (negativeTransfers.length > 0) {
      await tx`
        update transactions
        set amount = 0
        where id in ${tx(negativeTransfers.map((row) => row.id))}
      `;
    }

    archivedDuplicates = await archiveExactDuplicateTransactions(tx);
  });

  console.log(`Option and transfer repairs applied. Archived ${archivedDuplicates} exact duplicate transactions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
