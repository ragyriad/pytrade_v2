import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  canonicalizeSymbol,
  normalizeTransaction,
  normalizeSecurityProfile,
  normalizeSecurityIdentity,
  normalizeSecurityType as normalizeCommonSecurityType,
  parseOptionContract,
} from "@repo/data-normalizer";
import {
  planSecurityDuplicates,
  planStoredTransactionDuplicates,
  transactionEconomicKey,
} from "@repo/data-deduplicator";
import {
  accounts,
  db,
  eq,
  inArray,
  options,
  securities,
  securityAliases,
  sql,
  transactions,
  users,
  upsertOptions,
  upsertSecurities,
  upsertSecurityAliases,
  type Account,
  type NewAccount,
  type NewSecurityAlias,
  type NewSecurity,
  type NewOption,
  type NewTransaction,
  type Option,
  type Security,
  type SecurityAlias,
} from "@repo/db";

type LegacyAccount = {
  accountNumber: string;
  type: string;
  currentBalance: string;
  currency: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastSynced: Date;
  brokerName: string | null;
  netDeposits: string;
  linkedAccountId: string | null;
};

type LegacySecurity = {
  id: string;
  symbol: string;
  name: string | null;
  type: string | null;
  currency: string | null;
  exchange: string | null;
  createdAt: Date;
  lastSynced: Date;
  description: string | null;
};

type LegacyActivity = {
  id: string;
  currency: string | null;
  type: string;
  subType: string | null;
  action: string | null;
  price: string;
  quantity: string;
  amount: string | null;
  commission: string;
  symbol: string | null;
  marketCurrency: string | null;
  status: string | null;
  submittedAt: Date | null;
  filledAt: Date | null;
  createdAt: Date;
  lastSynced: Date;
  accountNumber: string;
  lastUpdated: Date;
  securityId: string | null;
};

type LegacyDeposit = {
  id: string;
  status: string | null;
  currency: string;
  amount: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
  lastSynced: Date | null;
  accountNumber: string | null;
};

const legacyImportSource = "Questrade Legacy";
const previousLegacyImportSource = "LEGACY_SQLITE";
const defaultDumpPath = "C:\\Users\\px13\\Documents\\Projects\\sqlite_dump.sql";

type ScriptOptions = {
  dumpPath: string;
  includeAccountNumbers: Set<string> | null;
  excludeAccountNumbers: Set<string>;
  skipPostImportRepairs: boolean;
};

function addDelimitedValues(target: Set<string>, value: string | undefined) {
  if (!value) return;

  for (const entry of value.split(",")) {
    const normalized = entry.trim();
    if (normalized) target.add(normalized);
  }
}

function parseScriptOptions(args: string[]): ScriptOptions {
  const includeAccountNumbers = new Set<string>();
  const excludeAccountNumbers = new Set<string>();
  let dumpPath = defaultDumpPath;
  let skipPostImportRepairs = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const nextValue = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }
      index += 1;
      return value;
    };

    if (arg === "--") {
      continue;
    }

    if (arg === "--skip-post-import-repairs") {
      skipPostImportRepairs = true;
      continue;
    }

    if (arg === "--account" || arg === "--accounts") {
      addDelimitedValues(includeAccountNumbers, nextValue());
      continue;
    }

    if (arg.startsWith("--account=") || arg.startsWith("--accounts=")) {
      addDelimitedValues(includeAccountNumbers, arg.slice(arg.indexOf("=") + 1));
      continue;
    }

    if (arg === "--exclude-account" || arg === "--exclude-accounts") {
      addDelimitedValues(excludeAccountNumbers, nextValue());
      continue;
    }

    if (arg.startsWith("--exclude-account=") || arg.startsWith("--exclude-accounts=")) {
      addDelimitedValues(excludeAccountNumbers, arg.slice(arg.indexOf("=") + 1));
      continue;
    }

    if (arg === "--dump") {
      dumpPath = nextValue();
      continue;
    }

    if (arg.startsWith("--dump=")) {
      dumpPath = arg.slice("--dump=".length);
      continue;
    }

    if (!arg.startsWith("--")) {
      dumpPath = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    dumpPath,
    includeAccountNumbers: includeAccountNumbers.size > 0 ? includeAccountNumbers : null,
    excludeAccountNumbers,
    skipPostImportRepairs,
  };
}

const scriptOptions = parseScriptOptions(process.argv.slice(2));

function parseSqlValue(raw: string): string | null {
  if (raw.toUpperCase() === "NULL") return null;
  return raw;
}

function splitSqlValues(valuesSource: string): Array<string | null> {
  const values: Array<string | null> = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < valuesSource.length; index += 1) {
    const char = valuesSource[index];
    const next = valuesSource[index + 1];

    if (char === "'") {
      if (inString && next === "'") {
        current += "'";
        index += 1;
        continue;
      }

      inString = !inString;
      continue;
    }

    if (char === "," && !inString) {
      values.push(parseSqlValue(current.trim()));
      current = "";
      continue;
    }

    current += char;
  }

  values.push(parseSqlValue(current.trim()));
  return values;
}

function parseInsertLine(line: string, table: string): Array<string | null> | null {
  const prefix = `INSERT INTO ${table} VALUES(`;
  if (!line.startsWith(prefix)) return null;

  return splitSqlValues(line.slice(prefix.length, line.lastIndexOf(")")));
}

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function requiredDate(value: string | null | undefined): Date {
  return toDate(value) ?? new Date(0);
}

function money(value: string | null | undefined, fallback = "0"): string {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : "0.00";
}

function numeric(value: string | null | undefined, scale = 6): string | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(scale) : null;
}

function normalizeAccountType(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes("tfsa")) return "TFSA";
  if (normalized.includes("fhsa")) return "FHSA";
  if (normalized.includes("rrsp")) return "RRSP";
  if (normalized.includes("non")) return "Non registered";
  return value;
}

function normalizeStatus(value: string): NewAccount["status"] {
  const normalized = value.toLowerCase();
  if (normalized === "open") return "open";
  if (normalized === "closed") return "closed";
  if (normalized === "inactive") return "inactive";
  if (normalized === "deactivated") return "deactivated";
  if (normalized === "error") return "error";
  return "active";
}

function stripCanadianSuffix(symbol: string): string {
  return symbol.toUpperCase().replace(/\.TO$/, "");
}

const sideFirstOptionPattern =
  /\b(PUTS?|CALLS?)\s+([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d+(?:\.\d+)?)\b/i;
const spacedOptionPattern =
  /\b([A-Z]{1,6})\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(PUTS?|CALLS?)\s+(\d+(?:\.\d+)?)\b/i;
const compactOptionSymbolPattern = /^([A-Z]{1,6})\d{1,2}[A-Z]{3}\d{2}[CP]\d+(?:\.\d+)?$/i;
const occOptionSymbolPattern = /^([A-Z]{1,6})\d{6}[CP]\d{8}$/i;
const compactNamedOptionPattern =
  /^([A-Z]{1,6})(\d{1,2})([A-Z]{3})(\d{2})([CP])(\d+(?:\.\d+)?)$/i;
const compactNumericOptionPattern = /^([A-Z]{1,6})(\d{6})([CP])(\d+(?:\.\d+)?)$/i;
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

type CanonicalSecurityType = "ETF" | "ADR" | "STOCK" | null;
type ParsedLegacyOption = {
  underlyingSymbol: string;
  displayUnderlyingSymbol: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  expirationDate: string;
  ticker: string;
  rawSymbol: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function extractUnderlyingSymbol(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const compact = normalized.match(compactOptionSymbolPattern)?.[1];
    if (compact) return compact.toUpperCase();

    const occ = normalized.match(occOptionSymbolPattern)?.[1];
    if (occ) return occ.toUpperCase();

    const sideFirst = normalized.match(sideFirstOptionPattern);
    if (sideFirst) return sideFirst[2].toUpperCase();

    const spaced = normalized.match(spacedOptionPattern);
    if (spaced) return spaced[1].toUpperCase();
  }

  return null;
}

function parseLegacyOptionDate(value: string | null | undefined): string | null {
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
    const month = months[named[2]];
    if (!month) return null;
    return `20${named[3]}-${month}-${named[1].padStart(2, "0")}`;
  }

  return null;
}

function optionSide(value: string): "CALL" | "PUT" {
  return normalizeText(value).startsWith("C") ? "CALL" : "PUT";
}

function canonicalLegacySymbol(symbol: string): string {
  return (
    canonicalizeSymbol(symbol, { source: legacyImportSource }) ??
    symbol.toUpperCase()
  );
}

function formatOccOptionTicker(input: {
  underlyingSymbol: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  expirationDate: string;
}): string {
  const [year, month, day] = input.expirationDate.split("-");
  const side = input.contractType === "CALL" ? "C" : "P";
  const strike = Math.round(Number(input.strikePrice) * 1000)
    .toString()
    .padStart(8, "0");
  return `${input.underlyingSymbol}${year.slice(2)}${month}${day}${side}${strike}`;
}

function legacyOptionDescription(
  option: Pick<
    ParsedLegacyOption,
    "displayUnderlyingSymbol" | "expirationDate" | "contractType" | "strikePrice"
  >
): string {
  return `${option.displayUnderlyingSymbol} ${option.expirationDate} ${option.contractType} ${Number(
    option.strikePrice
  )}`;
}

function buildParsedLegacyOption(input: {
  underlyingSymbol: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  expirationDate: string;
  rawSymbol: string | null;
}): ParsedLegacyOption {
  const displayUnderlyingSymbol = input.underlyingSymbol.toUpperCase();

  return {
    underlyingSymbol: canonicalLegacySymbol(displayUnderlyingSymbol),
    displayUnderlyingSymbol,
    contractType: input.contractType,
    strikePrice: input.strikePrice,
    expirationDate: input.expirationDate,
    ticker: formatOccOptionTicker({
      underlyingSymbol: displayUnderlyingSymbol,
      contractType: input.contractType,
      strikePrice: input.strikePrice,
      expirationDate: input.expirationDate,
    }),
    rawSymbol: input.rawSymbol,
  };
}

function parseLegacyOption(
  ...values: Array<string | null | undefined>
): ParsedLegacyOption | null {
  const shared = parseOptionContract(
    ...[...values].sort((left, right) => {
      const evidence = (value: string | null | undefined) =>
        /\b(?:CALLS?|PUTS?)\b/i.test(value ?? "") ? 1 : 0;
      return evidence(right) - evidence(left);
    })
  );
  if (shared) {
    return buildParsedLegacyOption({
      underlyingSymbol: shared.rawUnderlyingSymbol,
      contractType: shared.contractType,
      strikePrice: shared.strikePrice,
      expirationDate: shared.expirationDate,
      rawSymbol: values.find((value) => value?.trim())?.trim() ?? null,
    });
  }

  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;

    const occ = normalized.match(occOptionSymbolPattern);
    if (occ) {
      const compact = normalized.replace(/\s+/g, "");
      const match = compact.match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/i);
      if (!match) continue;
      const strikePrice = (Number(match[6]) / 1000).toFixed(6);
      const expirationDate = `20${match[2]}-${match[3]}-${match[4]}`;
      const contractType = match[5].toUpperCase() === "C" ? "CALL" : "PUT";
      return buildParsedLegacyOption({
        underlyingSymbol: match[1],
        contractType,
        strikePrice,
        expirationDate,
        rawSymbol: normalized,
      });
    }

    const named = normalized.match(compactNamedOptionPattern);
    if (named) {
      const expirationDate = parseLegacyOptionDate(`${named[2]}${named[3]}${named[4]}`);
      if (!expirationDate) continue;
      const contractType = named[5].toUpperCase() === "C" ? "CALL" : "PUT";
      const strikePrice = Number(named[6]).toFixed(6);
      const underlyingSymbol = named[1].toUpperCase();
      return buildParsedLegacyOption({
        underlyingSymbol,
        contractType,
        strikePrice,
        expirationDate,
        rawSymbol: normalized,
      });
    }

    const numericMatch = normalized.match(compactNumericOptionPattern);
    if (numericMatch && !occOptionSymbolPattern.test(normalized)) {
      const date = numericMatch[2];
      const expirationDate = `20${date.slice(4, 6)}-${date.slice(0, 2)}-${date.slice(2, 4)}`;
      const contractType = numericMatch[3].toUpperCase() === "C" ? "CALL" : "PUT";
      const strikePrice = Number(numericMatch[4]).toFixed(6);
      const underlyingSymbol = numericMatch[1].toUpperCase();
      return buildParsedLegacyOption({
        underlyingSymbol,
        contractType,
        strikePrice,
        expirationDate,
        rawSymbol: normalized,
      });
    }

    const sideFirst = normalized.match(sideFirstOptionPattern);
    if (sideFirst) {
      const expirationDate = parseLegacyOptionDate(sideFirst[3]);
      if (!expirationDate) continue;
      const contractType = optionSide(sideFirst[1]);
      const strikePrice = Number(sideFirst[4]).toFixed(6);
      const underlyingSymbol = sideFirst[2].toUpperCase();
      return buildParsedLegacyOption({
        underlyingSymbol,
        contractType,
        strikePrice,
        expirationDate,
        rawSymbol: normalized,
      });
    }

    const spaced = normalized.match(spacedOptionPattern);
    if (spaced) {
      const expirationDate = parseLegacyOptionDate(spaced[2]);
      if (!expirationDate) continue;
      const contractType = optionSide(spaced[3]);
      const strikePrice = Number(spaced[4]).toFixed(6);
      const underlyingSymbol = spaced[1].toUpperCase();
      return buildParsedLegacyOption({
        underlyingSymbol,
        contractType,
        strikePrice,
        expirationDate,
        rawSymbol: normalized,
      });
    }
  }

  return null;
}

function normalizeSecuritySymbol(value: string | null | undefined): string | null {
  return canonicalizeSymbol(value, { source: legacyImportSource });
}

function extractSecuritySymbolFromLegacyText(...values: Array<string | null | undefined>): string | null {
  const optionUnderlying = extractUnderlyingSymbol(...values);
  if (optionUnderlying) return optionUnderlying;

  for (const value of values) {
    const normalized = normalizeText(value);
    if (/\bVALE\s+S\s+A\b/.test(normalized) || /\bVALE\b/.test(normalized)) {
      return "VALE";
    }
  }

  return null;
}

function isLegacyOptionSecurity(security: LegacySecurity): boolean {
  return (
    Boolean(extractUnderlyingSymbol(security.symbol, security.description, security.name)) ||
    normalizeText(security.type) === "OPTION"
  );
}

function legacySecurityDisplaySymbol(security: LegacySecurity): string {
  return (
    extractSecuritySymbolFromLegacyText(security.symbol, security.description, security.name) ??
    normalizeSecuritySymbol(security.symbol) ??
    security.symbol
  );
}

function legacySecurityRawSymbol(security: LegacySecurity): string {
  return stripCanadianSuffix(legacySecurityDisplaySymbol(security));
}

function normalizeSecurityType(input: {
  symbol?: string | null;
  rawSymbol?: string | null;
  type?: string | null;
  description?: string | null;
  name?: string | null;
  instrumentTypeCode?: string | null;
  instrumentTypeDescription?: string | null;
}): CanonicalSecurityType {
  const symbol = normalizeSecuritySymbol(input.symbol);
  const commonType = normalizeCommonSecurityType({
    code: input.instrumentTypeCode ?? input.type,
    description: [
      input.description,
      input.name,
      input.instrumentTypeDescription,
    ]
      .filter(Boolean)
      .join(" "),
    symbol,
  });
  if (commonType === "ETF" || commonType === "ADR" || commonType === "STOCK") {
    return commonType;
  }
  const text = normalizeText(
    [
      input.symbol,
      input.rawSymbol,
      input.type,
      input.description,
      input.name,
      input.instrumentTypeCode,
      input.instrumentTypeDescription,
    ]
      .filter(Boolean)
      .join(" ")
  );

  if (
    (symbol && knownEtfSymbols.has(symbol)) ||
    text.includes("ETF") ||
    text.includes("EXCHANGE TRADED FUND")
  ) {
    return "ETF";
  }

  if (
    text.includes("COMMON STOCK") ||
    text.includes("EQUITY") ||
    text.includes("REAL ESTATE INVESTMENT TRUST") ||
    text.includes("DEPOSITARY") ||
    text.includes("SHARES") ||
    text.includes(" STOCK") ||
    text.endsWith(" STOCK") ||
    normalizeText(input.type) === "STOCK" ||
    (symbol != null &&
      !["CAD", "USD"].includes(symbol) &&
      /^[A-Z]{1,5}(?:[.-][A-Z]{1,4})?(?:\.TO)?$/.test(symbol))
  ) {
    return "STOCK";
  }

  return null;
}

function legacySecurityType(security: LegacySecurity): CanonicalSecurityType {
  if (isLegacyOptionSecurity(security) && !normalizeSecurityType(security)) return null;
  return normalizeSecurityType({
    symbol: legacySecurityDisplaySymbol(security),
    rawSymbol: legacySecurityRawSymbol(security),
    type: security.type,
    description: security.description,
    name: security.name,
  });
}

function securityType(security: Security): CanonicalSecurityType {
  return normalizeSecurityType({
    symbol: security.symbol,
    rawSymbol: security.rawSymbol,
    description: security.description,
    instrumentTypeCode: security.instrumentTypeCode,
    instrumentTypeDescription: security.instrumentTypeDescription,
  });
}

function isOptionSecurity(security: Pick<Security, "symbol" | "rawSymbol" | "description" | "instrumentTypeCode" | "instrumentTypeDescription">): boolean {
  return (
    normalizeText(security.instrumentTypeCode) === "OPTION" ||
    normalizeText(security.instrumentTypeDescription).includes("OPTION") ||
    Boolean(parseLegacyOption(security.symbol, security.rawSymbol, security.description))
  );
}

function legacySecurityTypeDescription(security: LegacySecurity): string | null {
  return legacySecurityType(security);
}

function legacySecurityTypeCode(security: LegacySecurity): string | null {
  return legacySecurityType(security);
}

function normalizeSymbol(symbol: string | null | undefined): string {
  if (!symbol) return "__NO_SYMBOL__";
  const underlying = extractUnderlyingSymbol(symbol);
  return stripCanadianSuffix(normalizeSecuritySymbol(underlying ?? symbol) ?? symbol.trim());
}

function securityLookupKeys(symbol: string | null, currency: string | null): string[] {
  const upperSymbol = symbol?.trim().toUpperCase();
  if (!upperSymbol) return [];

  const currencyKey = currency?.trim().toUpperCase() ?? "";
  const stripped = stripCanadianSuffix(upperSymbol);
  const keys = new Set<string>([
    `${upperSymbol}|${currencyKey}`,
    `${stripped}|${currencyKey}`,
  ]);

  if (currencyKey === "CAD") {
    keys.add(`${stripped}.TO|${currencyKey}`);
  }

  return [...keys];
}

function legacySecurityLookupKeys(security: LegacySecurity): string[] {
  return securityLookupKeys(legacySecurityDisplaySymbol(security), security.currency);
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function duplicateKey(input: {
  accountId: string;
  symbol: string | null;
  description?: string | null;
  tradeDate: Date;
  amount: string | number | null;
  units: string | number | null;
  currency: string | null;
}): string {
  const parsedOption = parseLegacyOption(input.symbol, input.description);
  return transactionEconomicKey({
    accountId: input.accountId,
    symbol: parsedOption?.underlyingSymbol ?? input.symbol,
    tradeDate: input.tradeDate,
    amount: input.amount ?? 0,
    units: input.units,
    currencyCode: input.currency,
  });
}

function transactionType(activity: LegacyActivity): string {
  const type = activity.type.toLowerCase();
  const text = `${activity.type} ${activity.subType ?? ""} ${activity.action ?? ""}`.toLowerCase();

  if (type === "convert funds") return "CONVERSION";
  if (type === "dividend") return "DIVIDEND";
  if (type === "interest earnings") return "INTEREST";
  if (type === "deposit") return "DEPOSIT";
  if (type === "fees and rebates") return "FEE";
  if (type === "institutional transfer") return "TRANSFER";
  if (type === "corporate action") return "CORPORATE_ACTION";
  if (type === "securities lending") return "SECURITIES_LENDING";

  if (type === "order" || type === "option") {
    if (text.includes("buy") || text.includes("bought")) return "BUY";
    if (text.includes("sell") || text.includes("sold")) return "SELL";
  }

  return "OTHER";
}

function isLegacyOptionActivity(
  activity: LegacyActivity,
  legacySecurity: LegacySecurity | undefined
): boolean {
  return (
    normalizeText(activity.type) === "OPTION" ||
    Boolean(
      extractUnderlyingSymbol(
        activity.symbol,
        activity.subType,
        activity.action,
        legacySecurity?.symbol,
        legacySecurity?.name,
        legacySecurity?.description
      )
    ) ||
    (normalizeText(legacySecurity?.type) === "OPTION" &&
      ["BUY", "SELL"].includes(transactionType(activity)))
  );
}

function legacyTransactionDescription(
  activity: LegacyActivity,
  legacySecurity: LegacySecurity | undefined
): string {
  return [
    activity.type,
    activity.subType,
    activity.action,
    legacySecurity?.name ?? legacySecurity?.description,
    activity.status,
  ]
    .filter(Boolean)
    .join(" / ");
}

function transactionSymbol(
  activity: LegacyActivity,
  legacySecurity: LegacySecurity | undefined,
  security: Security | undefined
): string | null {
  return (
    extractSecuritySymbolFromLegacyText(
      activity.symbol,
      legacySecurity?.symbol,
      legacySecurity?.name,
      legacySecurity?.description
    ) ??
    normalizeSecuritySymbol(activity.symbol) ??
    (legacySecurity ? legacySecurityDisplaySymbol(legacySecurity) : null) ??
    security?.symbol ??
    null
  );
}

function legacyImportKey(
  record: { id: string },
  accountId: string,
  _currency: string | null,
  _symbol: string | null
): string {
  return [legacyImportSource, accountId, record.id].join("|");
}

function generatedLegacyId(key: string): string {
  const hash = createHash("sha1").update(`${legacyImportSource}:${key}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function securityMergeSymbol(security: Security): string {
  if (isOptionSecurity(security)) return security.symbol.toUpperCase();

  return (
    extractSecuritySymbolFromLegacyText(security.symbol, security.rawSymbol, security.description) ??
    normalizeSecuritySymbol(security.symbol) ??
    security.symbol.toUpperCase()
  );
}

function isLegacySecurity(security: Security): boolean {
  return security.securityKey.startsWith("legacy-security:");
}

function cleanDescription(value: string | null | undefined, targetSymbol: string): string | null {
  const description = value?.trim();
  if (!description) return null;
  if (normalizeText(description) === targetSymbol) return null;
  if (extractUnderlyingSymbol(description)) return null;
  return description;
}

function bestSecurityDescription(rows: Security[], targetSymbol: string): string {
  return (
    rows
      .map((security) => cleanDescription(security.description, targetSymbol))
      .find(Boolean) ?? targetSymbol
  );
}

function aliasExternalKey(alias: SecurityAlias): string | null {
  return alias.externalId ? `${alias.source}|${alias.externalId}` : null;
}

function aliasSymbolKey(alias: SecurityAlias): string {
  return [
    alias.source,
    normalizeText(alias.symbol),
    normalizeText(alias.currencyCode),
    normalizeText(alias.exchangeCode),
  ].join("|");
}

async function mergeAndNormalizeSecurities(): Promise<number> {
  const [securityRows, transactionRows, aliasRows] = await Promise.all([
    db.select().from(securities),
    db.select().from(transactions),
    db.select().from(securityAliases),
  ]);
  const transactionCountBySecurity = new Map<string, number>();
  const aliasCountBySecurity = new Map<string, number>();

  for (const transaction of transactionRows) {
    if (!transaction.securityId) continue;
    transactionCountBySecurity.set(
      transaction.securityId,
      (transactionCountBySecurity.get(transaction.securityId) ?? 0) + 1
    );
  }

  for (const alias of aliasRows) {
    aliasCountBySecurity.set(
      alias.securityId,
      (aliasCountBySecurity.get(alias.securityId) ?? 0) + 1
    );
  }

  const securitiesById = new Map(
    securityRows.map((security) => [security.id, security])
  );
  const plans = planSecurityDuplicates(
    securityRows.map((security) => ({
      id: security.id,
      canonicalSymbol: securityMergeSymbol(security),
      storedSymbol: security.symbol,
      canonicalType: securityType(security),
      isSynthetic: isLegacySecurity(security),
      hasProviderId: Boolean(security.snaptradeSymbolId),
      hasFigi: Boolean(security.figiCode),
      hasExchange: Boolean(security.exchangeCode || security.exchangeName),
      transactionCount: transactionCountBySecurity.get(security.id) ?? 0,
      aliasCount: aliasCountBySecurity.get(security.id) ?? 0,
    }))
  );

  let changedGroups = 0;
  for (const plan of plans) {
    const group = [plan.keeperId, ...plan.duplicateIds].map(
      (id) => securitiesById.get(id)!
    );
    const targetSymbol = plan.canonicalSymbol;
    const targetType = plan.canonicalType as CanonicalSecurityType;
    const canonical = securitiesById.get(plan.keeperId)!;
    const duplicateIds = plan.duplicateIds;
    const canonicalType = securityType(canonical);
    const needsCanonicalUpdate =
      canonical.symbol !== targetSymbol ||
      (targetType != null &&
        (canonicalType !== targetType ||
          canonical.instrumentTypeCode !== targetType ||
          canonical.instrumentTypeDescription !== targetType));

    if (duplicateIds.length === 0 && !needsCanonicalUpdate) continue;

    const firstSeenAt = group.reduce(
      (earliest, security) =>
        security.firstSeenAt < earliest ? security.firstSeenAt : earliest,
      canonical.firstSeenAt
    );
    const lastSeenAt = group.reduce(
      (latest, security) => (security.lastSeenAt > latest ? security.lastSeenAt : latest),
      canonical.lastSeenAt
    );

    await db
      .update(securities)
      .set({
        symbol: targetSymbol,
        rawSymbol:
          extractUnderlyingSymbol(canonical.rawSymbol) || canonical.rawSymbol
            ? targetSymbol
            : canonical.rawSymbol,
        description: bestSecurityDescription(group, targetSymbol),
        instrumentTypeCode: targetType ?? canonical.instrumentTypeCode,
        instrumentTypeDescription: targetType ?? canonical.instrumentTypeDescription,
        firstSeenAt,
        lastSeenAt,
        updatedAt: new Date(),
      })
      .where(eq(securities.id, canonical.id));

    if (duplicateIds.length > 0) {
      const canonicalIsOption = isOptionSecurity(canonical);
      await db
        .update(transactions)
        .set(
          canonicalIsOption
            ? { securityId: canonical.id }
            : { securityId: canonical.id, underlyingSecurityId: canonical.id, symbol: targetSymbol }
        )
        .where(inArray(transactions.securityId, duplicateIds));

      if (!canonicalIsOption) {
        await db
          .update(transactions)
          .set({ underlyingSecurityId: canonical.id })
          .where(inArray(transactions.underlyingSecurityId, duplicateIds));

        await db
          .update(options)
          .set({ underlyingSecurityId: canonical.id, updatedAt: new Date() })
          .where(inArray(options.underlyingSecurityId, duplicateIds));
      }

      const canonicalAliases = new Set<string>();
      for (const alias of aliasRows.filter((row) => row.securityId === canonical.id)) {
        const externalKey = aliasExternalKey(alias);
        if (externalKey) canonicalAliases.add(`external:${externalKey}`);
        canonicalAliases.add(`symbol:${aliasSymbolKey(alias)}`);
      }

      for (const alias of aliasRows.filter((row) => duplicateIds.includes(row.securityId))) {
        const externalKey = aliasExternalKey(alias);
        const hasConflict =
          (externalKey && canonicalAliases.has(`external:${externalKey}`)) ||
          canonicalAliases.has(`symbol:${aliasSymbolKey(alias)}`);

        if (hasConflict) {
          await db.delete(securityAliases).where(eq(securityAliases.id, alias.id));
          continue;
        }

        await db
          .update(securityAliases)
          .set({ securityId: canonical.id, updatedAt: new Date() })
          .where(eq(securityAliases.id, alias.id));
        if (externalKey) canonicalAliases.add(`external:${externalKey}`);
        canonicalAliases.add(`symbol:${aliasSymbolKey(alias)}`);
      }

      await db.delete(securities).where(inArray(securities.id, duplicateIds));
    }

    changedGroups += 1;
  }

  return changedGroups;
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

async function normalizeTransactionsInPlace(): Promise<number> {
  await db
    .update(accounts)
    .set({ subType: "CASH", updatedAt: new Date() })
    .where(inArray(accounts.subType, ["CASH_USD", "CASH_CAD"]));

  const rows = await db
    .select({
      transaction: transactions,
      accountType: accounts.subType,
      security: securities,
    })
    .from(transactions)
    .innerJoin(accounts, eq(transactions.accountId, accounts.id))
    .leftJoin(securities, eq(transactions.securityId, securities.id));

  let updates = 0;
  for (const row of rows) {
    const normalized = normalizeTransaction(
      {
        type: row.transaction.type,
        description: row.transaction.description,
        symbol: row.transaction.symbol,
        amount: row.transaction.amount,
        units: row.transaction.units,
      },
      row.security
        ? {
            symbol: row.security.symbol,
            rawSymbol: row.security.rawSymbol,
            description: row.security.description,
            instrumentTypeCode: row.security.instrumentTypeCode,
            instrumentTypeDescription: row.security.instrumentTypeDescription,
          }
        : null,
      { accountType: row.accountType }
    );
    const cashAccount = isCashAccount(row.accountType);
    const nextType = cashAccount ? "CASH" : row.transaction.type;
    const shouldClearSymbol = isCashPlaceholderSymbol(
      row.transaction.symbol,
      row.transaction.currencyCode,
      normalized.action
    );
    const nextSymbol = shouldClearSymbol ? null : row.transaction.symbol;
    const nextSecurityId = shouldClearSymbol ? null : row.transaction.securityId;
    const nextUnderlyingSecurityId = shouldClearSymbol
      ? null
      : row.transaction.underlyingSecurityId ??
        (normalized.assetType === "OPTION" ? null : nextSecurityId);

    if (
      row.transaction.type === nextType &&
      row.transaction.action === normalized.action &&
      row.transaction.assetType === normalized.assetType &&
      row.transaction.symbol === nextSymbol &&
      row.transaction.securityId === nextSecurityId &&
      row.transaction.underlyingSecurityId === nextUnderlyingSecurityId
    ) {
      continue;
    }

    await db
      .update(transactions)
      .set({
        type: nextType,
        action: normalized.action,
        assetType: normalized.assetType,
        symbol: nextSymbol,
        securityId: nextSecurityId,
        underlyingSecurityId: nextUnderlyingSecurityId,
      })
      .where(eq(transactions.id, row.transaction.id));
    updates += 1;
  }

  return updates;
}

async function archivePlannedDuplicateTransactions(): Promise<number> {
  const rows = (await db.select().from(transactions)).filter(
    (transaction) => !transaction.isArchived
  );
  const decisions = planStoredTransactionDuplicates(
    rows.map((transaction) => ({
      ...transaction,
      settlementDate:
        typeof transaction.rawData?.settlementDate === "string"
          ? transaction.rawData.settlementDate
          : typeof transaction.rawData?.settlement_date === "string"
            ? transaction.rawData.settlement_date
            : null,
    }))
  );
  const archiveIds = [
    ...new Set(decisions.map((decision) => decision.duplicateId)),
  ];

  if (archiveIds.length > 0) {
    await db
      .update(transactions)
      .set({ isArchived: true })
      .where(inArray(transactions.id, archiveIds));
  }

  return archiveIds.length;
}

async function normalizeExistingLegacyTransactionMetadata(): Promise<number> {
  const updated = await db
    .update(transactions)
    .set({
      legacyImportKey: sql`${legacyImportSource} || '|' || ${transactions.accountId}::text || '|' || ${transactions.externalTransactionId}`,
    })
    .where(
      sql`${transactions.source} = ${legacyImportSource} and ${transactions.externalTransactionId} is not null`
    )
    .returning({ id: transactions.id });

  return updated.length;
}

function parseDump(path: string) {
  const contents = readFileSync(path, "utf8");
  const accountsByNumber = new Map<string, LegacyAccount>();
  const securitiesById = new Map<string, LegacySecurity>();
  const activities: LegacyActivity[] = [];
  const deposits: LegacyDeposit[] = [];

  for (const line of contents.split(/\r?\n/)) {
    const accountValues = parseInsertLine(line, "account");
    if (accountValues) {
      const account: LegacyAccount = {
        accountNumber: accountValues[0] ?? "",
        type: accountValues[1] ?? "",
        currentBalance: accountValues[2] ?? "0",
        currency: accountValues[3] ?? "USD",
        status: accountValues[4] ?? "active",
        createdAt: requiredDate(accountValues[6]),
        updatedAt: requiredDate(accountValues[7]),
        lastSynced: requiredDate(accountValues[8]),
        brokerName: accountValues[9],
        netDeposits: accountValues[10] ?? "0",
        linkedAccountId: accountValues[11],
      };
      accountsByNumber.set(account.accountNumber, account);
      continue;
    }

    const securityValues = parseInsertLine(line, "security");
    if (securityValues) {
      const security: LegacySecurity = {
        id: securityValues[0] ?? "",
        symbol: securityValues[1] ?? "",
        name: securityValues[2],
        type: securityValues[3],
        currency: securityValues[4],
        exchange: securityValues[6],
        createdAt: requiredDate(securityValues[8]),
        lastSynced: requiredDate(securityValues[9]),
        description: securityValues[10],
      };
      securitiesById.set(security.id, security);
      continue;
    }

    const activityValues = parseInsertLine(line, "activity");
    if (activityValues) {
      activities.push({
        id: activityValues[0] ?? "",
        currency: activityValues[1],
        type: activityValues[2] ?? "Other",
        subType: activityValues[3],
        action: activityValues[4],
        price: activityValues[6] ?? "0",
        quantity: activityValues[7] ?? "0",
        amount: activityValues[8],
        commission: activityValues[9] ?? "0",
        symbol: activityValues[11],
        marketCurrency: activityValues[12],
        status: activityValues[13],
        submittedAt: toDate(activityValues[16]),
        filledAt: toDate(activityValues[17]),
        createdAt: requiredDate(activityValues[18]),
        lastSynced: requiredDate(activityValues[19]),
        accountNumber: activityValues[20] ?? "",
        lastUpdated: requiredDate(activityValues[21]),
        securityId: activityValues[22],
      });
      continue;
    }

    const depositValues = parseInsertLine(line, "deposit");
    if (depositValues) {
      deposits.push({
        id: depositValues[0] ?? "",
        status: depositValues[2],
        currency: depositValues[3] ?? "CAD",
        amount: depositValues[4],
        acceptedAt: toDate(depositValues[7]),
        createdAt: requiredDate(depositValues[8]),
        lastSynced: toDate(depositValues[9]),
        accountNumber: depositValues[10],
      });
    }
  }

  return {
    accounts: [...accountsByNumber.values()],
    securities: [...securitiesById.values()],
    activities,
    deposits,
    securitiesById,
  };
}

type ParsedDump = ReturnType<typeof parseDump>;

function filterParsedDump(
  parsed: ParsedDump,
  includeAccountNumbers: Set<string> | null,
  excludeAccountNumbers: Set<string>
): ParsedDump {
  const accounts = parsed.accounts.filter(
    (account) =>
      (!includeAccountNumbers || includeAccountNumbers.has(account.accountNumber)) &&
      !excludeAccountNumbers.has(account.accountNumber)
  );
  const accountNumbers = new Set(accounts.map((account) => account.accountNumber));
  const activities = parsed.activities.filter((activity) =>
    accountNumbers.has(activity.accountNumber)
  );
  const deposits = parsed.deposits.filter(
    (deposit) => deposit.accountNumber != null && accountNumbers.has(deposit.accountNumber)
  );
  const securityIds = new Set(
    activities
      .map((activity) => activity.securityId)
      .filter((securityId): securityId is string => Boolean(securityId))
  );
  const securities = parsed.securities.filter((security) => securityIds.has(security.id));
  const securitiesById = new Map(securities.map((security) => [security.id, security]));

  return {
    accounts,
    securities,
    activities,
    deposits,
    securitiesById,
  };
}

async function main() {
  const dumpPath = resolve(scriptOptions.dumpPath);
  if (!existsSync(dumpPath)) {
    throw new Error(`SQLite dump not found: ${dumpPath}`);
  }

  const unfilteredParsed = parseDump(dumpPath);
  const requestedMissingAccounts = scriptOptions.includeAccountNumbers
    ? [...scriptOptions.includeAccountNumbers].filter(
        (accountNumber) =>
          !unfilteredParsed.accounts.some((account) => account.accountNumber === accountNumber)
      )
    : [];
  if (requestedMissingAccounts.length > 0) {
    throw new Error(`Requested account(s) not found in dump: ${requestedMissingAccounts.join(", ")}`);
  }

  const parsed = filterParsedDump(
    unfilteredParsed,
    scriptOptions.includeAccountNumbers,
    scriptOptions.excludeAccountNumbers
  );
  const user = (await db.select().from(users).limit(1))[0];
  if (!user) throw new Error("No user exists. Run the normal seed/sync first.");

  const renamedLegacyTransactions = await db
    .update(transactions)
    .set({ source: legacyImportSource, isArchived: true })
    .where(eq(transactions.source, previousLegacyImportSource))
    .returning({ id: transactions.id });
  const normalizedLegacyMetadata = await normalizeExistingLegacyTransactionMetadata();

  const currentAccounts = await db.select().from(accounts);
  const accountsByNumber = new Map(
    currentAccounts
      .filter((account) => account.brokerageAccountNumber)
      .map((account) => [account.brokerageAccountNumber as string, account])
  );

  const missingAccounts: NewAccount[] = parsed.accounts
    .filter((account) => !accountsByNumber.has(account.accountNumber))
    .map((account) => ({
      userId: user.id,
      brokerageAccountNumber: account.accountNumber,
      brokerageName: account.brokerName,
      accountCurrency: account.currency,
      balanceAmount: money(account.currentBalance),
      balanceCurrency: account.currency,
      status: "closed",
      isArchived: true,
      type: null,
      subType: normalizeAccountType(account.type),
      name: `${account.brokerName ?? "Legacy"} ${normalizeAccountType(account.type)} ${account.currency}`,
      linkedAccountId: account.linkedAccountId,
      firstTransactionDate: null,
      lastTransactionsSyncAt: account.lastSynced,
      lastHoldingsSyncAt: account.lastSynced,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

  const closedLegacyAccounts: Array<{ id: string; brokerageAccountNumber: string | null }> = [];

  if (missingAccounts.length > 0) {
    const inserted = await db.insert(accounts).values(missingAccounts).returning();
    for (const account of inserted) {
      if (account.brokerageAccountNumber) {
        accountsByNumber.set(account.brokerageAccountNumber, account);
      }
    }
  }

  const currentSecurities = await db.select().from(securities);
  const securitiesByLegacyId = new Map<string, Security>();
  const securitiesByLookup = new Map<string, Security>();

  function addSecurityLookup(security: Security) {
    for (const key of securityLookupKeys(security.symbol, security.currencyCode)) {
      securitiesByLookup.set(key, security);
    }
    const normalizedSymbol =
      extractSecuritySymbolFromLegacyText(security.symbol, security.rawSymbol, security.description) ??
      normalizeSecuritySymbol(security.symbol);
    if (normalizedSymbol) {
      for (const key of securityLookupKeys(normalizedSymbol, security.currencyCode)) {
        securitiesByLookup.set(key, security);
      }
    }
    securitiesByLookup.set(`${security.securityKey}|`, security);
  }

  for (const security of currentSecurities) addSecurityLookup(security);

  const missingSecurities: NewSecurity[] = [];
  for (const legacySecurity of parsed.securities) {
    const legacyKey = `legacy-security:${legacySecurity.id}`;
    const existingByLegacyKey = currentSecurities.find(
      (security) => security.securityKey === legacyKey
    );
    const existingBySymbol = legacySecurityLookupKeys(legacySecurity)
      .map((key) => securitiesByLookup.get(key))
      .find(Boolean);

    if (existingByLegacyKey || existingBySymbol) {
      securitiesByLegacyId.set(legacySecurity.id, existingBySymbol ?? existingByLegacyKey!);
      continue;
    }

    const displaySymbol = legacySecurityDisplaySymbol(legacySecurity);
    const profile = normalizeSecurityProfile({
      symbol: displaySymbol,
      description: legacySecurity.name ?? legacySecurity.description,
      currencyCode: legacySecurity.currency,
      observedAt: legacySecurity.lastSynced ?? legacySecurity.createdAt,
    });
    missingSecurities.push({
      securityKey: legacyKey,
      source: legacyImportSource,
      isArchived: true,
      snaptradeSymbolId: null,
      symbol: profile?.symbol ?? displaySymbol,
      rawSymbol: legacySecurityRawSymbol(legacySecurity),
      description:
        profile?.description ??
        legacySecurity.name ??
        legacySecurity.description,
      currencyCode: profile?.currencyCode ?? legacySecurity.currency,
      exchangeCode: profile?.exchangeCode ?? legacySecurity.exchange,
      exchangeMicCode: profile?.exchangeMicCode ?? null,
      exchangeName: profile?.exchangeName ?? legacySecurity.exchange,
      listingStatus: profile?.listingStatus ?? "ACTIVE",
      delistedAt: profile?.delistedAt ?? null,
      instrumentTypeCode: legacySecurityTypeCode(legacySecurity),
      instrumentTypeDescription: legacySecurityTypeDescription(legacySecurity),
      figiCode: null,
      figiInstrumentCode: null,
      logoUrl: null,
      firstSeenAt: legacySecurity.createdAt,
      lastSeenAt: legacySecurity.lastSynced,
    });
  }

  const insertedSecurities = await upsertSecurities(
    db,
    missingSecurities.map((input) => {
      const identity = normalizeSecurityIdentity(input);
      return {
        ...input,
        symbol: identity.symbol ?? input.symbol,
        rawSymbol: identity.rawSymbol,
      };
    })
  );
  for (const security of insertedSecurities) {
    addSecurityLookup(security);
    const legacyId = security.securityKey.replace("legacy-security:", "");
    securitiesByLegacyId.set(legacyId, security);
  }

  const allSecurities = [...currentSecurities, ...insertedSecurities];
  for (const legacySecurity of parsed.securities) {
    if (securitiesByLegacyId.has(legacySecurity.id)) continue;
    const matched = allSecurities.find(
      (security) => security.securityKey === `legacy-security:${legacySecurity.id}`
    );
    if (matched) securitiesByLegacyId.set(legacySecurity.id, matched);
  }

  const aliasInputs: NewSecurityAlias[] = [];
  const aliasKeys = new Set<string>();
  for (const legacySecurity of parsed.securities) {
    const security = securitiesByLegacyId.get(legacySecurity.id);
    if (!security) continue;

    const aliasKey = `${legacyImportSource}|${legacySecurity.id}`;
    if (aliasKeys.has(aliasKey)) continue;
    aliasKeys.add(aliasKey);

    aliasInputs.push({
      securityId: security.id,
      source: legacyImportSource,
      isArchived: true,
      externalId: legacySecurity.id,
      symbol: legacySecurityDisplaySymbol(legacySecurity),
      rawSymbol: legacySecurityRawSymbol(legacySecurity),
      currencyCode: legacySecurity.currency,
      exchangeCode: legacySecurity.exchange,
      exchangeMicCode: null,
    });
  }

  const upsertedAliases = await upsertSecurityAliases(db, aliasInputs);

  const existingTransactions = await db.select().from(transactions);
  const existingExternalIds = new Set(
    existingTransactions
      .filter(
        (transaction) =>
          transaction.source === legacyImportSource && transaction.externalTransactionId
      )
      .map((transaction) => transaction.externalTransactionId as string)
  );
  const existingDuplicateKeys = new Set<string>();

  for (const transaction of existingTransactions) {
    if (transaction.legacyImportKey) {
      existingDuplicateKeys.add(transaction.legacyImportKey);
    }
    existingDuplicateKeys.add(
      duplicateKey({
        accountId: transaction.accountId,
        symbol: transaction.symbol,
        description: transaction.description,
        tradeDate: transaction.tradeDate,
        amount: transaction.amount,
        units: transaction.units,
        currency: transaction.currencyCode,
      })
    );
  }

  let exactDuplicates = 0;
  let probableDuplicates = 0;
  const unresolvedAccounts = new Set<string>();
  const unresolvedSecurities = new Set<string>();
  const transactionInputs: NewTransaction[] = [];
  const optionByTicker = new Map<
    string,
    {
      option: Option;
      contractSecurity: Security;
      underlyingSecurity: Security;
    }
  >();

  async function ensureSecurity(input: NewSecurity, preferSymbolLookup: boolean): Promise<Security> {
    const identity = normalizeSecurityIdentity(input);
    const normalizedInput: NewSecurity = {
      ...input,
      symbol: identity.symbol ?? input.symbol,
      rawSymbol: identity.rawSymbol,
    };
    const existingByKey = securitiesByLookup.get(`${normalizedInput.securityKey}|`);
    const existingBySymbol = preferSymbolLookup
      ? securityLookupKeys(
          normalizedInput.symbol,
          normalizedInput.currencyCode ?? null
        )
          .map((lookupKey) => securitiesByLookup.get(lookupKey))
          .find(Boolean)
      : undefined;
    const existing = existingBySymbol ?? existingByKey;
    if (existing) return existing;

    const [inserted] = await upsertSecurities(db, [normalizedInput]);
    addSecurityLookup(inserted);
    return inserted;
  }

  function securityMatchesUnderlying(security: Security | undefined, underlyingSymbol: string): boolean {
    if (!security || isOptionSecurity(security)) return false;
    return (
      normalizeText(security.symbol) === underlyingSymbol ||
      normalizeText(security.rawSymbol) === underlyingSymbol ||
      securityMergeSymbol(security) === underlyingSymbol
    );
  }

  function legacyOptionAction(activity: LegacyActivity, type: string): string | null {
    const text = normalizeText([activity.type, activity.subType, activity.action].filter(Boolean).join(" "));
    if (text.includes("BUY TO CLOSE")) return "BUY_TO_CLOSE";
    if (text.includes("SELL TO OPEN")) return "SELL_TO_OPEN";
    if (text.includes("BUY")) return "BUY_TO_OPEN";
    if (text.includes("SELL")) return "SELL_TO_CLOSE";
    if (type === "BUY") return "BUY_TO_OPEN";
    if (type === "SELL") return "SELL_TO_CLOSE";
    return null;
  }

  async function ensureLegacyOption(input: {
    parsed: ParsedLegacyOption;
    activity: LegacyActivity;
    security: Security | undefined;
    currency: string;
    tradeDate: Date;
  }) {
    const cached = optionByTicker.get(input.parsed.ticker);
    if (cached) return cached;

    const underlyingProfile = normalizeSecurityProfile({
      symbol: input.parsed.underlyingSymbol,
      description: input.security?.description,
      currencyCode: input.currency,
      observedAt: input.tradeDate,
    });
    const underlyingSecurity = securityMatchesUnderlying(
      input.security,
      input.parsed.underlyingSymbol
    )
      ? input.security!
      : await ensureSecurity(
          {
            securityKey: `legacy-underlying:${input.parsed.underlyingSymbol}:${input.currency}`,
            source: legacyImportSource,
            isArchived: true,
            snaptradeSymbolId: null,
            symbol:
              underlyingProfile?.symbol ?? input.parsed.underlyingSymbol,
            rawSymbol: input.parsed.underlyingSymbol,
            description:
              underlyingProfile?.description ??
              input.parsed.underlyingSymbol,
            currencyCode:
              underlyingProfile?.currencyCode ?? input.currency,
            exchangeCode: underlyingProfile?.exchangeCode ?? null,
            exchangeMicCode:
              underlyingProfile?.exchangeMicCode ?? null,
            exchangeName: underlyingProfile?.exchangeName ?? null,
            instrumentTypeCode: "STOCK",
            instrumentTypeDescription: "STOCK",
            listingStatus:
              underlyingProfile?.listingStatus ?? "ACTIVE",
            delistedAt: underlyingProfile?.delistedAt ?? null,
            figiCode: null,
            figiInstrumentCode: null,
            logoUrl: null,
            firstSeenAt: input.tradeDate,
            lastSeenAt: input.tradeDate,
          },
          true
        );

    const contractSecurity = await ensureSecurity(
      {
        securityKey: `option:${input.parsed.ticker}`,
        source: legacyImportSource,
        isArchived: true,
        snaptradeSymbolId: null,
        symbol: input.parsed.underlyingSymbol,
        rawSymbol: input.parsed.rawSymbol ?? input.parsed.ticker,
        description: legacyOptionDescription(input.parsed),
        currencyCode: input.currency,
        exchangeCode: null,
        exchangeMicCode: null,
        exchangeName: null,
        instrumentTypeCode: null,
        instrumentTypeDescription: null,
        figiCode: null,
        figiInstrumentCode: null,
        logoUrl: null,
        firstSeenAt: input.tradeDate,
        lastSeenAt: input.tradeDate,
      },
      false
    );

    const optionInput: NewOption = {
      securityId: contractSecurity.id,
      underlyingSecurityId: underlyingSecurity.id,
      ticker: input.parsed.ticker,
      contractType: input.parsed.contractType,
      strikePrice: input.parsed.strikePrice,
      expirationDate: input.parsed.expirationDate,
      multiplier: "100",
      status: "closed",
      isMiniOption: false,
      isArchived: true,
      rawData: {
        source: legacyImportSource,
        legacyActivityId: input.activity.id,
        rawSymbol: input.parsed.rawSymbol,
        displayUnderlyingSymbol: input.parsed.displayUnderlyingSymbol,
      },
      firstSeenAt: input.tradeDate,
      lastSeenAt: input.tradeDate,
    };
    const [option] = await upsertOptions(db, [optionInput]);
    const value = { option, contractSecurity, underlyingSecurity };
    optionByTicker.set(input.parsed.ticker, value);
    return value;
  }

  for (const activity of parsed.activities) {
    const account = accountsByNumber.get(activity.accountNumber);
    if (!account) {
      unresolvedAccounts.add(activity.accountNumber);
      continue;
    }

    if (existingExternalIds.has(activity.id)) {
      exactDuplicates += 1;
      continue;
    }

    const currency = activity.currency ?? activity.marketCurrency ?? "USD";
    const legacySecurity = activity.securityId
      ? parsed.securitiesById.get(activity.securityId)
      : undefined;
    const security =
      (activity.securityId ? securitiesByLegacyId.get(activity.securityId) : undefined) ??
      securityLookupKeys(activity.symbol, currency)
        .map((lookupKey) => securitiesByLookup.get(lookupKey))
        .find(Boolean);

    if (!security && (activity.securityId || activity.symbol)) {
      unresolvedSecurities.add(activity.securityId ?? activity.symbol ?? "");
    }

    const tradeDate = activity.filledAt ?? activity.submittedAt ?? activity.lastUpdated ?? activity.createdAt;
    const isOptionActivity = isLegacyOptionActivity(activity, legacySecurity);
    const baseDescription = legacyTransactionDescription(activity, legacySecurity);
    const parsedOption = isOptionActivity
      ? parseLegacyOption(
          activity.symbol,
          activity.subType,
          activity.action,
          legacySecurity?.symbol,
          legacySecurity?.name,
          legacySecurity?.description,
          baseDescription
        )
      : null;
    const description = parsedOption ? legacyOptionDescription(parsedOption) : baseDescription;
    const symbol = parsedOption?.underlyingSymbol ?? transactionSymbol(activity, legacySecurity, security);
    const key = legacyImportKey(activity, account.id, currency, symbol);
    if (existingDuplicateKeys.has(key)) {
      exactDuplicates += 1;
      continue;
    }

    const candidateType = transactionType(activity);
    const candidateAmount = candidateType === "TRANSFER" ? "0" : activity.amount;
    const valueKey = duplicateKey({
      accountId: account.id,
      symbol,
      description,
      tradeDate,
      amount: candidateAmount,
      units: activity.quantity,
      currency,
    });
    if (existingDuplicateKeys.has(valueKey)) {
      probableDuplicates += 1;
      continue;
    }

    const optionRefs = parsedOption
      ? await ensureLegacyOption({
          parsed: parsedOption,
          activity,
          security,
          currency,
          tradeDate,
      })
      : null;
    const transactionSecurity = optionRefs?.underlyingSecurity ?? security;
    const underlyingSecurity = optionRefs?.underlyingSecurity ?? (security ?? null);
    const finalSymbol = optionRefs?.underlyingSecurity.symbol ?? symbol;
    const type = candidateType;
    const normalized = normalizeTransaction(
      {
        type,
        description,
        symbol: finalSymbol,
        amount: activity.amount,
        units: activity.quantity,
      },
      transactionSecurity
        ? {
            symbol: transactionSecurity.symbol,
            rawSymbol: transactionSecurity.rawSymbol,
            description: transactionSecurity.description,
            instrumentTypeCode: transactionSecurity.instrumentTypeCode,
            instrumentTypeDescription: transactionSecurity.instrumentTypeDescription,
          }
        : legacySecurity
          ? {
              symbol: legacySecurityDisplaySymbol(legacySecurity),
              rawSymbol: legacySecurityRawSymbol(legacySecurity),
              description: legacySecurity.name ?? legacySecurity.description,
              instrumentTypeCode: legacySecurityTypeCode(legacySecurity),
              instrumentTypeDescription: legacySecurityTypeDescription(legacySecurity),
            }
          : null
    );

    transactionInputs.push({
      snaptradeTransactionId: null,
      source: legacyImportSource,
      isArchived: true,
      externalTransactionId: activity.id,
      legacyImportKey: key,
      accountId: account.id,
      securityId: transactionSecurity?.id ?? null,
      underlyingSecurityId: optionRefs?.underlyingSecurity.id ?? underlyingSecurity?.id ?? null,
      optionId: optionRefs?.option.id ?? null,
      type,
      action: normalized.action,
      optionAction: optionRefs ? legacyOptionAction(activity, type) : null,
      assetType: isOptionActivity ? "OPTION" : normalized.assetType,
      description,
      amount: type === "TRANSFER" ? "0" : money(activity.amount),
      price: numeric(activity.price, 6),
      units: numeric(activity.quantity, 6),
      fee: money(activity.commission, "0"),
      currencyCode: currency.slice(0, 3),
      symbol: finalSymbol?.slice(0, 20) ?? null,
      tradeDate,
      rawData: activity as unknown as Record<string, unknown>,
      createdAt: activity.createdAt,
    });
    existingExternalIds.add(activity.id);
    existingDuplicateKeys.add(key);
    existingDuplicateKeys.add(valueKey);
  }

  for (const deposit of parsed.deposits) {
    if (!deposit.accountNumber) {
      unresolvedAccounts.add("<missing deposit account>");
      continue;
    }

    const account = accountsByNumber.get(deposit.accountNumber);
    if (!account) {
      unresolvedAccounts.add(deposit.accountNumber);
      continue;
    }

    if (existingExternalIds.has(deposit.id)) {
      exactDuplicates += 1;
      continue;
    }

    const tradeDate = deposit.acceptedAt ?? deposit.createdAt;
    const key = legacyImportKey(deposit, account.id, deposit.currency, null);
    if (existingDuplicateKeys.has(key)) {
      exactDuplicates += 1;
      continue;
    }

    const valueKey = duplicateKey({
      accountId: account.id,
      symbol: null,
      tradeDate,
      amount: deposit.amount,
      units: "0",
      currency: deposit.currency,
    });
    if (existingDuplicateKeys.has(valueKey)) {
      probableDuplicates += 1;
      continue;
    }

    const amount = money(deposit.amount);
    const action = Number(amount) < 0 ? "WITHDRAWAL" : "DEPOSIT";
    transactionInputs.push({
      snaptradeTransactionId: null,
      source: legacyImportSource,
      isArchived: true,
      externalTransactionId: deposit.id,
      legacyImportKey: key,
      accountId: account.id,
      securityId: null,
      underlyingSecurityId: null,
      optionId: null,
      type: action,
      action,
      optionAction: null,
      assetType: "CASH",
      description: ["Deposit", deposit.status].filter(Boolean).join(" / "),
      amount,
      price: "0",
      units: "0",
      fee: "0",
      currencyCode: deposit.currency.slice(0, 3),
      symbol: null,
      tradeDate,
      rawData: deposit as unknown as Record<string, unknown>,
      createdAt: deposit.createdAt,
    });
    existingExternalIds.add(deposit.id);
    existingDuplicateKeys.add(key);
    existingDuplicateKeys.add(valueKey);
  }

  const insertedTransactions =
    transactionInputs.length === 0
      ? []
      : await db
          .insert(transactions)
          .values(transactionInputs)
          .onConflictDoNothing()
          .returning();

  console.log(
    JSON.stringify(
      {
        parsed: {
          accounts: parsed.accounts.length,
          securities: parsed.securities.length,
          activities: parsed.activities.length,
          deposits: parsed.deposits.length,
          includedAccounts: parsed.accounts.map((account) => account.accountNumber),
          excludedAccounts: [...scriptOptions.excludeAccountNumbers],
        },
        matchedOrCreated: {
          createdAccounts: missingAccounts.length,
          createdSecurities: insertedSecurities.length,
          upsertedSecurityAliases: upsertedAliases.length,
          renamedLegacyTransactions: renamedLegacyTransactions.length,
          normalizedLegacyMetadata,
          closedLegacyAccounts: closedLegacyAccounts.length,
        },
        duplicates: {
          exactExternalId: exactDuplicates,
          probableKey: probableDuplicates,
        },
        unresolved: {
          accounts: [...unresolvedAccounts],
          securities: [...unresolvedSecurities].slice(0, 25),
          securitiesCount: unresolvedSecurities.size,
        },
        insertedTransactions: insertedTransactions.length,
      },
      null,
      2
    )
  );

  if (!scriptOptions.skipPostImportRepairs) {
    const mergedSecurityGroups = await mergeAndNormalizeSecurities();
    const normalizedTransactions = await normalizeTransactionsInPlace();
    const archivedDuplicateTransactions = await archivePlannedDuplicateTransactions();

    console.log(
      JSON.stringify(
        {
          postImportCleanup: {
            mergedOrNormalizedSecurityGroups: mergedSecurityGroups,
            normalizedTransactions,
            archivedDuplicateTransactions,
          },
        },
        null,
        2
      )
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
  });
