import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type SecurityRow = {
  id: string;
  security_key: string;
  source: string;
  snaptrade_symbol_id: string | null;
  symbol: string;
  raw_symbol: string | null;
  description: string | null;
  currency_code: string | null;
  exchange_code: string | null;
  exchange_mic_code: string | null;
  exchange_name: string | null;
  instrument_type_code: string | null;
  instrument_type_description: string | null;
  figi_code: string | null;
  figi_instrument_code: string | null;
  logo_url: string | null;
  first_seen_at: Date | string;
  last_seen_at: Date | string;
  created_at: Date | string;
  transaction_count: number;
  alias_count: number;
};

type CanonicalSecurity = {
  symbol: string;
  rawSymbol?: string;
  description: string;
  instrumentTypeDescription: string;
};

type MergePlan = {
  canonical: SecurityRow;
  target: CanonicalSecurity;
  rows: SecurityRow[];
  remove: SecurityRow[];
  transactionCount: number;
  aliasCount: number;
};

const optionSymbolPattern = /^([A-Z]+)\d{1,2}[A-Z]{3}\d{2}[CP]\d+(?:\.\d+)?$/i;
const occOptionSymbolPattern = /^([A-Z]{1,6})\d{6}[CP]\d{8}$/i;

const securityFixesBySymbol: Record<string, CanonicalSecurity> = {
  AAPL: {
    symbol: "AAPL",
    description: "Apple Inc.",
    instrumentTypeDescription: "STOCK",
  },
  AMC: {
    symbol: "AMC",
    description: "AMC Entertainment Holdings, Inc.",
    instrumentTypeDescription: "STOCK",
  },
  AMD: {
    symbol: "AMD",
    description: "Advanced Micro Devices, Inc.",
    instrumentTypeDescription: "STOCK",
  },
  ARKF: {
    symbol: "ARKF",
    description: "ARK Blockchain & Fintech Innovation ETF",
    instrumentTypeDescription: "ETF",
  },
  BB: {
    symbol: "BB",
    description: "BlackBerry Limited",
    instrumentTypeDescription: "STOCK",
  },
  BIDU: {
    symbol: "BIDU",
    description: "Baidu, Inc.",
    instrumentTypeDescription: "STOCK",
  },
  CNQ: {
    symbol: "CNQ",
    description: "Canadian Natural Resources Limited",
    instrumentTypeDescription: "STOCK",
  },
  DIS: {
    symbol: "DIS",
    description: "Walt Disney Company (The)",
    instrumentTypeDescription: "STOCK",
  },
  "DOC.VN": {
    symbol: "DOC.VN",
    rawSymbol: "DOC",
    description: "CloudMD Software & Services Inc",
    instrumentTypeDescription: "STOCK",
  },
  ENPH: {
    symbol: "ENPH",
    description: "Enphase Energy, Inc.",
    instrumentTypeDescription: "STOCK",
  },
  ETSY: {
    symbol: "ETSY",
    description: "Etsy, Inc.",
    instrumentTypeDescription: "STOCK",
  },
  F: {
    symbol: "F",
    description: "Ford Motor Company",
    instrumentTypeDescription: "STOCK",
  },
  INTC: {
    symbol: "INTC",
    description: "Intel Corporation",
    instrumentTypeDescription: "STOCK",
  },
  MRNA: {
    symbol: "MRNA",
    description: "Moderna, Inc.",
    instrumentTypeDescription: "STOCK",
  },
  NIO: {
    symbol: "NIO",
    description: "NIO Inc.",
    instrumentTypeDescription: "STOCK",
  },
  NVDA: {
    symbol: "NVDA",
    description: "NVIDIA Corporation",
    instrumentTypeDescription: "STOCK",
  },
  SGOV: {
    symbol: "SGOV",
    description: "iShares 0-3 Month Treasury Bond ETF",
    instrumentTypeDescription: "ETF",
  },
  SHOP: {
    symbol: "SHOP",
    description: "Shopify Inc.",
    instrumentTypeDescription: "STOCK",
  },
  URNM: {
    symbol: "URNM",
    description: "Sprott Uranium Miners ETF",
    instrumentTypeDescription: "ETF",
  },
  VALE: {
    symbol: "VALE",
    description: "Vale S.A.",
    instrumentTypeDescription: "STOCK",
  },
  XYZ: {
    symbol: "XYZ",
    description: "Block, Inc.",
    instrumentTypeDescription: "STOCK",
  },
};

const successorSymbols: Record<string, string> = {
  DOC: "DOC.VN",
  SQ: "XYZ",
};

function uniqueUpperSymbols(rows: SecurityRow[]): string[] {
  return Array.from(
    new Set(
      rows
        .flatMap((row) => [row.symbol, row.raw_symbol])
        .map((value) => value?.trim().toUpperCase())
        .filter((value): value is string => Boolean(value))
    )
  );
}

function targetRawSymbol(target: CanonicalSecurity): string {
  const suffixMatch = target.symbol.match(/^(.+)\.(TO|VN)$/);
  return target.rawSymbol ?? suffixMatch?.[1] ?? target.symbol;
}

function parseOnlySymbols(): Set<string> | null {
  const values: string[] = [];
  const args = process.argv.slice(2);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const inlineMatch = arg.match(/^--(?:only|symbol)=(.+)$/);

    if (inlineMatch?.[1]) {
      values.push(inlineMatch[1]);
      continue;
    }

    if (arg === "--only" || arg === "--symbol") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a symbol value.`);
      }
      values.push(value);
      index += 1;
    }
  }

  const symbols = values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean)
    .map((symbol) => successorSymbols[symbol] ?? symbol);

  return symbols.length > 0 ? new Set(symbols) : null;
}

function normalizeInstrumentTypeDescription(value: string | null | undefined): string | null {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes("OPTION")) return "OPTION";
  if (normalized.includes("ETF") || normalized.includes("EXCHANGE TRADED FUND")) return "ETF";
  if (
    normalized === "STOCK" ||
    normalized.includes("COMMON STOCK") ||
    normalized.includes("EQUITY") ||
    normalized.includes("DEPOSITARY") ||
    normalized.includes("SHARES")
  ) {
    return "STOCK";
  }
  return value?.trim() ?? null;
}

function isOptionSecurity(row: SecurityRow): boolean {
  return (
    normalizeInstrumentTypeDescription(row.instrument_type_code) === "OPTION" ||
    normalizeInstrumentTypeDescription(row.instrument_type_description) === "OPTION" ||
    optionSymbolPattern.test(row.symbol) ||
    occOptionSymbolPattern.test(row.symbol) ||
    Boolean(row.raw_symbol && (optionSymbolPattern.test(row.raw_symbol) || occOptionSymbolPattern.test(row.raw_symbol)))
  );
}

function isStockLikeSymbol(value: string | null | undefined): boolean {
  const symbol = value?.trim().toUpperCase();
  if (!symbol || ["CAD", "USD"].includes(symbol)) return false;
  return /^[A-Z]{1,5}(?:[.-][A-Z]{1,4})?(?:\.TO)?$/.test(symbol);
}

function normalizeSymbol(value: string | null | undefined): string | null {
  const symbol = value?.trim().toUpperCase();
  if (!symbol) return null;

  const optionMatch = symbol.match(optionSymbolPattern);
  const underlying = optionMatch?.[1]?.toUpperCase() ?? symbol;

  return successorSymbols[underlying] ?? underlying;
}

function getCanonicalTarget(row: SecurityRow): CanonicalSecurity {
  if (isOptionSecurity(row)) {
    const symbol = row.symbol.toUpperCase();
    return {
      symbol,
      description: row.description?.trim() || symbol,
      instrumentTypeDescription: "OPTION",
    };
  }

  const symbol =
    normalizeSymbol(row.symbol) ??
    normalizeSymbol(row.raw_symbol) ??
    normalizeSymbol(row.description) ??
    row.symbol.toUpperCase();

  return (
    securityFixesBySymbol[symbol] ?? {
      symbol,
      description: row.description?.trim() || symbol,
      instrumentTypeDescription:
        normalizeInstrumentTypeDescription(row.instrument_type_description) ||
        (isStockLikeSymbol(symbol) ? "STOCK" : "Security"),
    }
  );
}

function isLegacySecurity(row: SecurityRow): boolean {
  return row.security_key.startsWith("legacy-security:");
}

function hasOptionDisplay(row: SecurityRow): boolean {
  if (isOptionSecurity(row)) return false;
  return Boolean(
    row.symbol.match(optionSymbolPattern) ||
      row.symbol.match(occOptionSymbolPattern) ||
      row.description?.match(optionSymbolPattern) ||
      row.description?.match(occOptionSymbolPattern)
  );
}

function needsRequestedSingleRowUpdate(row: SecurityRow, target: CanonicalSecurity): boolean {
  const targetHasCanonicalType = ["ETF", "STOCK", "OPTION"].includes(
    target.instrumentTypeDescription
  );
  return (
    hasOptionDisplay(row) ||
    row.symbol.toUpperCase() !== target.symbol ||
    (row.raw_symbol?.toUpperCase() ?? "") !== targetRawSymbol(target) ||
    (targetHasCanonicalType &&
      (normalizeInstrumentTypeDescription(row.instrument_type_description) !==
        target.instrumentTypeDescription ||
        normalizeInstrumentTypeDescription(row.instrument_type_code) !== target.instrumentTypeDescription))
  );
}

function scoreCanonical(row: SecurityRow, target: CanonicalSecurity): number {
  return [
    row.symbol === target.symbol ? 30 : 0,
    row.description === target.description ? 12 : 0,
    !isLegacySecurity(row) ? 10 : 0,
    row.snaptrade_symbol_id ? 6 : 0,
    row.figi_code ? 6 : 0,
    row.exchange_code || row.exchange_name ? 3 : 0,
    row.currency_code ? 2 : 0,
    row.transaction_count,
    row.alias_count,
  ].reduce((sum, value) => sum + value, 0);
}

function pickCanonical(rows: SecurityRow[], target: CanonicalSecurity): SecurityRow {
  return [...rows].sort((a, b) => {
    const scoreDiff = scoreCanonical(b, target) - scoreCanonical(a, target);
    if (scoreDiff !== 0) return scoreDiff;

    return (
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id.localeCompare(b.id)
    );
  })[0];
}

function buildMergePlans(rows: SecurityRow[]): MergePlan[] {
  const rowsBySymbol = new Map<string, SecurityRow[]>();

  for (const row of rows) {
    const target = getCanonicalTarget(row);
    rowsBySymbol.set(target.symbol, [...(rowsBySymbol.get(target.symbol) ?? []), row]);
  }

  return Array.from(rowsBySymbol.entries())
    .map(([symbol, group]) => {
      const knownTarget = securityFixesBySymbol[symbol];
      const targetForScoring =
        knownTarget ??
        ({
          symbol,
          description: symbol,
          instrumentTypeDescription: "Security",
        } satisfies CanonicalSecurity);
      const canonical = pickCanonical(group, targetForScoring);
      const target =
        knownTarget ??
        ({
          symbol,
          description: canonical.description?.trim() || symbol,
          instrumentTypeDescription:
            normalizeInstrumentTypeDescription(canonical.instrument_type_description) ||
            (isStockLikeSymbol(symbol) ? "STOCK" : "Security"),
        } satisfies CanonicalSecurity);
      const remove = group.filter((row) => row.id !== canonical.id);

      return {
        canonical,
        target,
        rows: group,
        remove,
        transactionCount: group.reduce((sum, row) => sum + Number(row.transaction_count), 0),
        aliasCount: group.reduce((sum, row) => sum + Number(row.alias_count), 0),
      };
    })
    .filter(
      (plan) =>
        plan.remove.length > 0 ||
        plan.rows.some((row) => needsRequestedSingleRowUpdate(row, plan.target))
    )
    .sort((a, b) => a.target.symbol.localeCompare(b.target.symbol));
}

function printPlans(plans: MergePlan[]): void {
  if (plans.length === 0) {
    console.log("No duplicate or renamed securities found.");
    return;
  }

  for (const plan of plans) {
    console.log("");
    console.log(
      `${plan.target.symbol} | ${plan.target.description} | rows=${plan.rows.length} | transactions=${plan.transactionCount} | aliases=${plan.aliasCount}`
    );
    console.log(`  keep ${plan.canonical.id} ${plan.canonical.symbol} ${plan.canonical.security_key}`);

    for (const row of plan.remove) {
      console.log(`  merge ${row.id} ${row.symbol} ${row.security_key}`);
    }
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlySymbols = parseOnlySymbols();
  const rows = await client<SecurityRow[]>`
    select
      securities.id,
      securities.security_key,
      securities.source,
      securities.snaptrade_symbol_id,
      securities.symbol,
      securities.raw_symbol,
      securities.description,
      securities.currency_code,
      securities.exchange_code,
      securities.exchange_mic_code,
      securities.exchange_name,
      securities.instrument_type_code,
      securities.instrument_type_description,
      securities.figi_code,
      securities.figi_instrument_code,
      securities.logo_url,
      securities.first_seen_at,
      securities.last_seen_at,
      securities.created_at,
      count(distinct transactions.id)::int as transaction_count,
      count(distinct security_aliases.id)::int as alias_count
    from securities
    left join transactions on transactions.security_id = securities.id
    left join security_aliases on security_aliases.security_id = securities.id
    group by securities.id
  `;

  const plans = buildMergePlans(rows).filter(
    (plan) => !onlySymbols || onlySymbols.has(plan.target.symbol)
  );
  printPlans(plans);

  if (!apply) {
    console.log("");
    console.log("Dry run only. Re-run with --apply to merge duplicate securities.");
    return;
  }

  await client.begin(async (tx) => {
    for (const plan of plans) {
      await tx`
        update securities
        set
          symbol = ${plan.target.symbol},
          raw_symbol = ${targetRawSymbol(plan.target)},
          description = ${plan.target.description},
          instrument_type_code = ${plan.target.instrumentTypeDescription},
          instrument_type_description = ${plan.target.instrumentTypeDescription},
          first_seen_at = least(first_seen_at, ${plan.rows.reduce(
            (earliest, row) =>
              new Date(row.first_seen_at) < new Date(earliest)
                ? row.first_seen_at
                : earliest,
            plan.canonical.first_seen_at
          )}),
          last_seen_at = greatest(last_seen_at, ${plan.rows.reduce(
            (latest, row) =>
              new Date(row.last_seen_at) > new Date(latest)
                ? row.last_seen_at
                : latest,
            plan.canonical.last_seen_at
          )}),
          updated_at = now()
        where id = ${plan.canonical.id}
      `;

      const duplicateIds = plan.remove.map((row) => row.id);
      const allPlanIds = plan.rows.map((row) => row.id);
      const oldSymbols = uniqueUpperSymbols(plan.rows);

      if (plan.target.instrumentTypeDescription === "OPTION") {
        if (duplicateIds.length > 0) {
          await tx`
            update transactions
            set security_id = ${plan.canonical.id}
            where security_id in ${tx(duplicateIds)}
          `;
        }
      } else {
        await tx`
          update transactions
          set security_id = ${plan.canonical.id}, symbol = ${plan.target.symbol}
          where security_id in ${tx(allPlanIds)}
        `;

        await tx`
          update transactions
          set underlying_security_id = ${plan.canonical.id}
          where underlying_security_id in ${tx(allPlanIds)}
        `;

        await tx`
          update options
          set underlying_security_id = ${plan.canonical.id}, updated_at = now()
          where underlying_security_id in ${tx(allPlanIds)}
        `;

        await tx`
          update positions
          set
            security_id = ${plan.canonical.id},
            symbol = ${plan.target.symbol},
            raw_symbol = ${targetRawSymbol(plan.target)},
            description = ${plan.target.description},
            instrument_type_code = ${plan.target.instrumentTypeDescription},
            instrument_type_description = ${plan.target.instrumentTypeDescription}
          where
            security_id in ${tx(allPlanIds)}
            or upper(symbol) in ${tx(oldSymbols)}
            or upper(coalesce(raw_symbol, '')) in ${tx(oldSymbols)}
        `;

        await tx`
          update dividend_events
          set
            security_id = ${plan.canonical.id},
            symbol = ${plan.target.symbol},
            updated_at = now()
          where
            security_id in ${tx(allPlanIds)}
            or upper(symbol) in ${tx(oldSymbols)}
        `;

        await tx`
          update security_price_snapshots
          set
            security_id = ${plan.canonical.id},
            symbol = ${plan.target.symbol},
            updated_at = now()
          where
            security_id in ${tx(allPlanIds)}
            or upper(symbol) in ${tx(oldSymbols)}
        `;
      }

      for (const row of plan.rows) {
        await tx`
          insert into security_aliases (
            security_id,
            source,
            external_id,
            symbol,
            raw_symbol,
            currency_code,
            exchange_code,
            exchange_mic_code
          )
          values (
            ${plan.canonical.id},
            ${row.source},
            ${row.snaptrade_symbol_id ?? row.security_key},
            ${row.symbol},
            ${row.raw_symbol},
            ${row.currency_code},
            ${row.exchange_code},
            ${row.exchange_mic_code}
          )
          on conflict do nothing
        `;
      }

      if (duplicateIds.length > 0) {
        await tx`
          update security_aliases
          set security_id = ${plan.canonical.id}, updated_at = now()
          where security_id in ${tx(duplicateIds)}
        `;

        await tx`
          delete from securities
          where id in ${tx(duplicateIds)}
        `;
      }
    }
  });

  console.log(`Merged or updated ${plans.length} security groups.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
