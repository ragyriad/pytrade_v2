import { createHash } from "node:crypto";
import {
  canonicalizeSymbol,
  normalizeSecurityProfile,
  normalizeSecurityIdentity,
  optionUnderlyingDescription,
  normalizeSecurityType,
  normalizeTransaction,
  parseOptionContract,
  preferSpecificSecurityType,
  resolveSecurityCandidate,
  type SecurityResolutionCandidate,
} from "@repo/data-normalizer";
import {
  preferredTransaction,
  transactionEconomicKey,
  type StoredTransactionLike,
} from "@repo/data-deduplicator";
import {
  accountBalances,
  accounts,
  and,
  eq,
  holdings as holdingsTable,
  inArray,
  securities,
  securityAliases,
  sql,
  transactions as transactionsTable,
  upsertOptions,
  upsertSecurities,
  upsertSecurityAliases,
  type DB,
  type NewOption,
  type NewSecurity,
  type NewSecurityAlias,
  type NewTransaction,
} from "@repo/db";
import type {
  ExtractedStatementData,
  HoldingSnapshot,
  StatementTransaction,
} from "./types.js";
import { STATEMENT_SOURCE } from "./types.js";

export interface DatabaseImportOptions {
  allowErrors?: boolean;
  dryRun?: boolean;
}

export interface DatabaseImportSummary {
  dryRun: boolean;
  statements: number;
  cashBalances: number;
  holdings: number;
  transactions: number;
  transactionsSkipped: number;
  warnings: number;
}

function decimal(value: number | null): string | null {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(2);
}

function requiredDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value: ${value}`);
  return value.toFixed(2);
}

function utcDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function rowsForStatement<T extends { statement_key: string }>(
  rows: T[],
  statementKey: string
): T[] {
  return rows.filter((row) => row.statement_key === statementKey);
}

function holdingImportKey(accountId: string, row: HoldingSnapshot): string {
  return createHash("sha256")
    .update([
      STATEMENT_SOURCE,
      accountId,
      row.statement_date,
      row.source_page,
      row.category,
      row.currency_code,
      row.raw_symbol,
    ].join("|"))
    .digest("hex");
}

type SecurityLookup = Map<string, Map<string, number>>;

type SecurityResolution =
  | { status: "resolved"; securityId: string }
  | { status: "missing"; securityId: null }
  | { status: "ambiguous"; securityId: null };

type StatementSecurityIdentity = {
  symbol: string;
  rawSymbol: string | null;
  currencyCode: string | null;
  description: string | null;
  instrumentTypeCode: string | null;
  exchangeCode: string | null;
  exchangeMicCode: string | null;
  exchangeName: string | null;
  listingStatus: "ACTIVE" | "DELISTED";
  delistedAt: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

function identityKey(symbol: string, currencyCode?: string | null): string {
  return `${canonicalizeSymbol(symbol) ?? symbol.trim().toUpperCase()}|${currencyCode?.trim().toUpperCase() ?? ""}`;
}

function addIdentity(
  lookup: SecurityLookup,
  symbol: string | null | undefined,
  currencyCode: string | null | undefined,
  securityId: string,
  score: number
): void {
  if (!symbol?.trim()) return;
  for (const [key, keyScore] of [
    [identityKey(symbol, currencyCode), score + 20],
    [identityKey(symbol), score],
  ] as const) {
    const candidates = lookup.get(key) ?? new Map<string, number>();
    candidates.set(
      securityId,
      Math.max(candidates.get(securityId) ?? Number.NEGATIVE_INFINITY, keyScore)
    );
    lookup.set(key, candidates);
  }
}

function resolveCandidates(
  candidates: Map<string, number> | undefined
): SecurityResolution {
  if (!candidates || candidates.size === 0) {
    return { status: "missing", securityId: null };
  }

  const highestScore = Math.max(...candidates.values());
  const winners = [...candidates]
    .filter(([, score]) => score === highestScore)
    .map(([securityId]) => securityId);

  return winners.length === 1
    ? { status: "resolved", securityId: winners[0] }
    : { status: "ambiguous", securityId: null };
}

function resolveSecurity(
  lookup: SecurityLookup,
  symbol: string,
  currencyCode: string | null
): SecurityResolution {
  const exactCandidates = lookup.get(identityKey(symbol, currencyCode));
  if (exactCandidates) return resolveCandidates(exactCandidates);
  return resolveCandidates(lookup.get(identityKey(symbol)));
}

function resolveSecurityId(
  lookup: SecurityLookup,
  symbol: string,
  currencyCode: string | null
): string | null {
  return resolveSecurity(lookup, symbol, currencyCode).securityId;
}

function securityKey(symbol: string, currencyCode: string | null): string {
  return `${STATEMENT_SOURCE}:${identityKey(symbol, currencyCode)}`;
}

function securityAliasExternalId(
  symbol: string,
  currencyCode: string | null
): string {
  return identityKey(symbol, currencyCode);
}

function boundedSymbol(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 50) : null;
}

function dateFromStatement(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function collectStatementSecurityIdentities(
  data: ExtractedStatementData
): StatementSecurityIdentity[] {
  const identities = new Map<string, StatementSecurityIdentity>();

  const add = (input: {
    symbol: string;
    rawSymbol: string | null;
    currencyCode: string | null;
    description: string | null;
    instrumentTypeCode: string | null;
    seenAt: Date;
  }) => {
    const normalizedIdentity = normalizeSecurityIdentity({
      symbol: input.symbol,
      rawSymbol: input.rawSymbol,
      description: input.description,
    });
    const profile = normalizeSecurityProfile({
      symbol: normalizedIdentity.symbol ?? input.symbol,
      description: input.description,
      currencyCode: input.currencyCode,
      observedAt: input.seenAt,
    });
    const symbol = boundedSymbol(
      profile?.symbol ??
        normalizedIdentity.symbol ??
        canonicalizeSymbol(input.symbol)
    );
    if (!symbol) return;

    const key = identityKey(symbol, input.currencyCode);
    const current = identities.get(key);
    if (!current) {
      identities.set(key, {
        symbol,
        rawSymbol: boundedSymbol(normalizedIdentity.rawSymbol),
        currencyCode: input.currencyCode,
        description:
          profile?.description ?? input.description?.trim() ?? null,
        instrumentTypeCode: input.instrumentTypeCode,
        exchangeCode: profile?.exchangeCode ?? null,
        exchangeMicCode: profile?.exchangeMicCode ?? null,
        exchangeName: profile?.exchangeName ?? null,
        listingStatus: profile?.listingStatus ?? "ACTIVE",
        delistedAt: profile?.delistedAt ?? null,
        firstSeenAt: input.seenAt,
        lastSeenAt: input.seenAt,
      });
      return;
    }

    current.firstSeenAt =
      input.seenAt < current.firstSeenAt ? input.seenAt : current.firstSeenAt;
    current.lastSeenAt =
      input.seenAt > current.lastSeenAt ? input.seenAt : current.lastSeenAt;
    if (!current.rawSymbol) {
      current.rawSymbol = boundedSymbol(normalizedIdentity.rawSymbol);
    }
    if (
      (!current.description || current.description === current.symbol) &&
      input.description?.trim()
    ) {
      current.description = input.description.trim();
    }
    if (!current.instrumentTypeCode && input.instrumentTypeCode) {
      current.instrumentTypeCode = input.instrumentTypeCode;
    }
    if (profile) {
      current.description = profile.description;
      current.exchangeCode = profile.exchangeCode;
      current.exchangeMicCode = profile.exchangeMicCode;
      current.exchangeName = profile.exchangeName;
      current.listingStatus = profile.listingStatus;
      current.delistedAt = profile.delistedAt;
    }
  };

  for (const row of data.holdings) {
    add({
      symbol: row.symbol,
      rawSymbol: row.raw_symbol,
      currencyCode: row.currency_code,
      description:
        row.asset_type === "OPTION"
          ? optionUnderlyingDescription(row.description) ?? row.symbol
          : row.description,
      instrumentTypeCode:
        row.asset_type === "OPTION"
          ? null
          : normalizeSecurityType({
              category: row.category,
              description: row.description,
              symbol: row.symbol,
            }),
      seenAt: dateFromStatement(row.statement_date),
    });
  }

  for (const row of data.transactions) {
    const normalized = normalizeTransaction({
      type: row.normalized_type,
      description: row.description,
      symbol: row.symbol,
      amount: statementAmount(row),
      units: row.quantity,
    });
    if (
      !row.symbol
      || row.asset_type === "CASH"
      || row.asset_type === "CURRENCY"
      || normalized.assetType === "CASH"
      || normalized.assetType === "INTEREST"
    ) {
      continue;
    }
    add({
      symbol: row.symbol,
      rawSymbol: row.raw_symbol,
      currencyCode: statementCurrency(row),
      description:
        row.asset_type === "OPTION"
          ? optionUnderlyingDescription(row.description) ?? row.symbol
          : row.description,
      instrumentTypeCode:
        row.asset_type === "OPTION"
          ? null
          : normalizeSecurityType({
              category: row.asset_type,
              description: row.description,
              symbol: row.symbol,
            }),
      seenAt: utcDate(row.transaction_date),
    });
  }

  return [...identities.values()];
}

type StatementOptionSeed = {
  ticker: string;
  underlyingSymbol: string;
  rawSymbol: string;
  description: string;
  currencyCode: string | null;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  expirationDate: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

async function ensureStatementOptions(
  db: DB,
  data: ExtractedStatementData,
  securityLookup: SecurityLookup
): Promise<Map<string, string>> {
  const seeds = new Map<string, StatementOptionSeed>();
  const add = (input: {
    symbol: string;
    rawSymbol: string;
    description: string;
    currencyCode: string | null;
    seenAt: Date;
  }) => {
    const parsed = parseOptionContract(
      input.description,
      input.rawSymbol,
      input.symbol
    );
    if (!parsed) return;
    const current = seeds.get(parsed.ticker);
    if (current) {
      current.firstSeenAt =
        input.seenAt < current.firstSeenAt ? input.seenAt : current.firstSeenAt;
      current.lastSeenAt =
        input.seenAt > current.lastSeenAt ? input.seenAt : current.lastSeenAt;
      return;
    }
    seeds.set(parsed.ticker, {
      ticker: parsed.ticker,
      underlyingSymbol: parsed.underlyingSymbol,
      rawSymbol: input.rawSymbol.trim() || parsed.ticker,
      description: input.description,
      currencyCode: input.currencyCode,
      contractType: parsed.contractType,
      strikePrice: parsed.strikePrice,
      expirationDate: parsed.expirationDate,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
    });
  };

  for (const row of data.holdings) {
    if (row.asset_type !== "OPTION") continue;
    add({
      symbol: row.symbol,
      rawSymbol: row.raw_symbol,
      description: row.description,
      currencyCode: row.currency_code,
      seenAt: dateFromStatement(row.statement_date),
    });
  }
  for (const row of data.transactions) {
    if (row.asset_type !== "OPTION") continue;
    add({
      symbol: row.symbol,
      rawSymbol: row.raw_symbol,
      description: row.description,
      currencyCode: statementCurrency(row),
      seenAt: utcDate(row.transaction_date),
    });
  }
  if (seeds.size === 0) return new Map();

  const contractInputs: NewSecurity[] = [...seeds.values()].map((seed) => ({
    securityKey: `option:${seed.ticker}`,
    source: STATEMENT_SOURCE,
    isArchived: false,
    snaptradeSymbolId: null,
    symbol: seed.underlyingSymbol,
    rawSymbol: seed.rawSymbol,
    description: seed.description,
    currencyCode: seed.currencyCode,
    exchangeCode: null,
    exchangeMicCode: null,
    exchangeName: null,
    instrumentTypeCode: null,
    instrumentTypeDescription: null,
    figiCode: null,
    figiInstrumentCode: null,
    logoUrl: null,
    firstSeenAt: seed.firstSeenAt,
    lastSeenAt: seed.lastSeenAt,
  }));
  const contractSecurities = await upsertSecurities(db, contractInputs);
  const contractByKey = new Map(
    contractSecurities.map((security) => [security.securityKey, security])
  );
  const today = new Date().toISOString().slice(0, 10);
  const optionInputs: NewOption[] = [...seeds.values()]
    .map((seed): NewOption | null => {
      const contractSecurity = contractByKey.get(`option:${seed.ticker}`);
      const underlyingSecurityId = resolveSecurityId(
        securityLookup,
        seed.underlyingSymbol,
        seed.currencyCode
      );
      if (!contractSecurity || !underlyingSecurityId) return null;
      return {
        securityId: contractSecurity.id,
        underlyingSecurityId,
        ticker: seed.ticker,
        contractType: seed.contractType,
        strikePrice: seed.strikePrice,
        expirationDate: seed.expirationDate,
        multiplier: "100",
        status: seed.expirationDate < today ? "closed" : "open",
        isMiniOption: false,
        isArchived: false,
        rawData: {
          source: STATEMENT_SOURCE,
          rawSymbol: seed.rawSymbol,
          description: seed.description,
        },
        firstSeenAt: seed.firstSeenAt,
        lastSeenAt: seed.lastSeenAt,
      };
    })
    .filter((option): option is NewOption => option !== null);
  const persistedOptions = await upsertOptions(db, optionInputs);
  return new Map(persistedOptions.map((option) => [option.ticker, option.id]));
}

async function ensureStatementSecurities(
  db: DB,
  lookup: SecurityLookup,
  identities: StatementSecurityIdentity[],
  securityTypesById: Map<string, string | null>,
  securitySymbolsById?: Map<string, string>
): Promise<{ securitiesUpserted: number; aliasesUpserted: number }> {
  let securitiesUpserted = 0;
  const orderedIdentities = [...identities].sort((left, right) => {
    const currencyPriority =
      Number(Boolean(right.currencyCode)) - Number(Boolean(left.currencyCode));
    return (
      currencyPriority ||
      left.symbol.localeCompare(right.symbol) ||
      (left.currencyCode ?? "").localeCompare(right.currencyCode ?? "")
    );
  });

  for (const identity of orderedIdentities) {
    const resolution = resolveSecurity(
      lookup,
      identity.symbol,
      identity.currencyCode
    );
    if (resolution.status === "ambiguous") {
      throw new Error(
        `Ambiguous security match for ${identityKey(
          identity.symbol,
          identity.currencyCode
        )}; resolve duplicate securities before importing.`
      );
    }
    if (resolution.status === "resolved") {
      const currentType = securityTypesById.get(resolution.securityId) ?? null;
      const preferredType = preferSpecificSecurityType(
        currentType,
        identity.instrumentTypeCode
      );
      const invalidOptionType =
        currentType?.trim().toUpperCase() === "OPTION";
      if (
        invalidOptionType ||
        (preferredType && preferredType !== currentType) ||
        identity.listingStatus === "DELISTED"
      ) {
        await db
          .update(securities)
          .set({
            instrumentTypeCode: invalidOptionType ? null : preferredType,
            instrumentTypeDescription: invalidOptionType ? null : preferredType,
            description:
              identity.listingStatus === "DELISTED"
                ? identity.description
                : undefined,
            exchangeCode:
              identity.listingStatus === "DELISTED"
                ? identity.exchangeCode
                : undefined,
            exchangeMicCode:
              identity.listingStatus === "DELISTED"
                ? identity.exchangeMicCode
                : undefined,
            exchangeName:
              identity.listingStatus === "DELISTED"
                ? identity.exchangeName
                : undefined,
            listingStatus: identity.listingStatus,
            delistedAt: identity.delistedAt,
          })
          .where(eq(securities.id, resolution.securityId));
        securityTypesById.set(
          resolution.securityId,
          invalidOptionType ? null : preferredType
        );
        securitiesUpserted += 1;
      }
      continue;
    }

    const securityInput: NewSecurity = {
      securityKey: securityKey(identity.symbol, identity.currencyCode),
      source: STATEMENT_SOURCE,
      isArchived: false,
      listingStatus: identity.listingStatus,
      delistedAt: identity.delistedAt,
      snaptradeSymbolId: null,
      symbol: identity.symbol,
      rawSymbol: identity.rawSymbol,
      description: identity.description ?? identity.symbol,
      currencyCode: identity.currencyCode,
      exchangeCode: identity.exchangeCode,
      exchangeMicCode: identity.exchangeMicCode,
      exchangeName: identity.exchangeName,
      instrumentTypeCode: identity.instrumentTypeCode,
      instrumentTypeDescription: identity.instrumentTypeCode,
      figiCode: null,
      figiInstrumentCode: null,
      logoUrl: null,
      firstSeenAt: identity.firstSeenAt,
      lastSeenAt: identity.lastSeenAt,
    };
    const [security] = await upsertSecurities(db, [securityInput]);
    securitiesUpserted += 1;
    securityTypesById.set(security.id, identity.instrumentTypeCode);
    securitySymbolsById?.set(security.id, security.symbol);
    addIdentity(
      lookup,
      security.symbol,
      security.currencyCode,
      security.id,
      200
    );
    addIdentity(
      lookup,
      security.rawSymbol,
      security.currencyCode,
      security.id,
      200
    );
  }

  const aliases: NewSecurityAlias[] = [];
  for (const identity of orderedIdentities) {
    const resolution = resolveSecurity(
      lookup,
      identity.symbol,
      identity.currencyCode
    );
    if (resolution.status !== "resolved") {
      throw new Error(
        `Unable to resolve security ${identityKey(
          identity.symbol,
          identity.currencyCode
        )} after security creation.`
      );
    }

    aliases.push({
      securityId: resolution.securityId,
      source: STATEMENT_SOURCE,
      externalId: securityAliasExternalId(
        identity.rawSymbol ?? identity.symbol,
        identity.currencyCode
      ),
      symbol: identity.rawSymbol ?? identity.symbol,
      rawSymbol: identity.rawSymbol,
      currencyCode: identity.currencyCode,
      exchangeCode: null,
      exchangeMicCode: null,
      isArchived: false,
    });
  }

  const persistedAliases = await upsertSecurityAliases(db, aliases);
  for (const alias of persistedAliases) {
    addIdentity(
      lookup,
      alias.symbol,
      alias.currencyCode,
      alias.securityId,
      350
    );
    addIdentity(
      lookup,
      alias.rawSymbol,
      alias.currencyCode,
      alias.securityId,
      350
    );
  }

  return {
    securitiesUpserted,
    aliasesUpserted: persistedAliases.length,
  };
}

type SecurityLookupRow = {
  id: string;
  securityKey: string;
  source: string;
  snaptradeSymbolId: string | null;
  symbol: string;
  rawSymbol: string | null;
  currencyCode: string | null;
  exchangeCode: string | null;
  exchangeMicCode: string | null;
  figiCode: string | null;
  description: string | null;
  instrumentTypeCode: string | null;
};

type SecurityAliasLookupRow = {
  securityId: string;
  source: string;
  externalId: string | null;
  symbol: string;
  rawSymbol: string | null;
  currencyCode: string | null;
  exchangeCode: string | null;
  exchangeMicCode: string | null;
};

function buildSecurityLookup(
  securityRows: SecurityLookupRow[],
  aliasRows: SecurityAliasLookupRow[]
): SecurityLookup {
  const lookup: SecurityLookup = new Map();
  const qualityBySecurityId = new Map<string, number>();

  for (const security of securityRows) {
    const storedSymbol = security.symbol.trim().toUpperCase();
    const qualityScore =
      50 +
      (security.source === "SNAPTRADE" ? 20 : 0) +
      (security.snaptradeSymbolId ? 100 : 0) +
      (security.figiCode ? 80 : 0) +
      (security.exchangeMicCode || security.exchangeCode ? 40 : 0) +
      (
        canonicalizeSymbol(storedSymbol) === storedSymbol
          ? 30
          : 0
      ) +
      (!security.securityKey.includes("exchange:unknown") ? 10 : 0) +
      (
        security.description &&
        normalizedCompositeText(security.description) !==
          normalizedCompositeText(security.symbol)
          ? 5
          : 0
      );
    qualityBySecurityId.set(security.id, qualityScore);
    addIdentity(
      lookup,
      security.symbol,
      security.currencyCode,
      security.id,
      qualityScore
    );
    addIdentity(
      lookup,
      security.rawSymbol,
      security.currencyCode,
      security.id,
      qualityScore
    );
  }

  for (const alias of aliasRows) {
    const aliasScore =
      300 +
      (alias.source === "SNAPTRADE" ? 100 : 0) +
      (alias.externalId ? 20 : 0) +
      (alias.exchangeMicCode || alias.exchangeCode ? 20 : 0) +
      (qualityBySecurityId.get(alias.securityId) ?? 0);
    addIdentity(
      lookup,
      alias.symbol,
      alias.currencyCode,
      alias.securityId,
      aliasScore
    );
    addIdentity(
      lookup,
      alias.rawSymbol,
      alias.currencyCode,
      alias.securityId,
      aliasScore
    );
  }

  return lookup;
}

function statementAmount(row: StatementTransaction): number {
  return row.net_amount
    ?? row.gross_amount
    ?? row.cad_net_amount
    ?? row.usd_net_amount
    ?? 0;
}

function statementCurrency(row: StatementTransaction): string | null {
  if (row.currency_code) return row.currency_code;
  if (row.cad_net_amount != null || row.cad_gross_amount != null) return "CAD";
  if (row.usd_net_amount != null || row.usd_gross_amount != null) return "USD";
  return null;
}

function normalizedCompositeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function incomingTransactionKeys(
  accountId: string,
  row: StatementTransaction,
  normalizedSymbol?: string | null
): string[] {
  return [...new Set([row.transaction_date, row.settlement_date])]
    .filter((date) => date.trim().length > 0)
    .map((date) =>
      transactionEconomicKey({
        accountId,
        symbol: normalizedSymbol ?? row.symbol,
        tradeDate: date,
        amount: statementAmount(row),
        units: row.quantity,
        currencyCode: statementCurrency(row),
      })
    );
}

function statementRawData(row: StatementTransaction): Record<string, unknown> {
  return {
    statementDate: row.statement_date,
    settlementDate: row.settlement_date,
    sourceFile: row.source_file,
    sourcePage: row.source_page,
    statementRowIndex: row.statement_row_index,
    rawActivityType: row.raw_activity_type,
    rawSymbol: row.raw_symbol,
    optionType: row.option_type,
    recordDate: row.record_date,
    paymentDate: row.payment_date,
    fxRate: row.fx_rate,
    cad: {
      price: row.cad_price,
      grossAmount: row.cad_gross_amount,
      commission: row.cad_commission,
      netAmount: row.cad_net_amount,
    },
    usd: {
      price: row.usd_price,
      grossAmount: row.usd_gross_amount,
      commission: row.usd_commission,
      netAmount: row.usd_net_amount,
    },
    rawText: row.raw_text,
  };
}

type ExistingTransactionRow = {
  id: string;
  source: string;
  isArchived: boolean;
  accountId: string;
  securityId: string | null;
  underlyingSecurityId: string | null;
  assetType: string | null;
  symbol: string | null;
  description: string | null;
  type: string;
  amount: string;
  units: string | null;
  currencyCode: string | null;
  tradeDate: Date;
  legacyImportKey: string | null;
  rawData: Record<string, unknown> | null;
};

type PreparedStatementTransaction = {
  statementKey: string;
  existingId: string | null;
  value: NewTransaction;
};

function buildStatementTransaction(
  row: StatementTransaction,
  accountId: string,
  securityLookup: SecurityLookup,
  securityTypesById: Map<string, string | null>,
  securitySymbolsById: Map<string, string>,
  securityCandidates: SecurityResolutionCandidate[],
  optionIdsByTicker: Map<string, string>
): NewTransaction {
  const currencyCode = statementCurrency(row);
  const directSecurityId = row.symbol
    ? resolveSecurityId(securityLookup, row.symbol, currencyCode)
    : null;
  const resolvedCandidate = directSecurityId
    ? null
    : resolveSecurityCandidate(
        {
          symbol: row.symbol,
          description: row.description,
          currencyCode,
          rawData: statementRawData(row),
        },
        securityCandidates
      );
  const resolvedSecurityId = directSecurityId ?? resolvedCandidate?.id ?? null;
  const isOption = row.asset_type === "OPTION";
  const parsedOption = isOption
    ? parseOptionContract(row.description, row.raw_symbol, row.symbol)
    : null;
  const optionId = parsedOption
    ? optionIdsByTicker.get(parsedOption.ticker) ?? null
    : null;
  const resolvedSecurityType = resolvedSecurityId
    ? securityTypesById.get(resolvedSecurityId) ?? null
    : null;
  const canonicalSymbol =
    (resolvedSecurityId
      ? securitySymbolsById.get(resolvedSecurityId)
      : null) ??
    canonicalizeSymbol(row.symbol) ??
    (row.symbol?.trim() || null) ??
    null;
  const normalizedSecurityType = normalizeSecurityType({
        category: resolvedSecurityType ?? row.asset_type,
        description: row.description,
        symbol: row.symbol,
      });
  const normalizedTransaction = normalizeTransaction(
    {
      type: row.normalized_type,
      description: row.description,
      symbol: canonicalSymbol,
      amount: statementAmount(row),
      units: row.quantity,
    },
    {
      symbol: canonicalSymbol,
      description: row.description,
      instrumentTypeCode: normalizedSecurityType,
      instrumentTypeDescription: normalizedSecurityType,
    }
  );
  const assetType = isOption ? "OPTION" : normalizedTransaction.assetType;
  const isCashLike =
    row.asset_type === "CASH"
    || row.asset_type === "CURRENCY"
    || normalizedTransaction.assetType === "CASH"
    || normalizedTransaction.assetType === "INTEREST";

  return {
    snaptradeTransactionId: null,
    source: STATEMENT_SOURCE,
    externalTransactionId: row.import_key,
    legacyImportKey: `${STATEMENT_SOURCE}:${row.import_key}`,
    isArchived: false,
    accountId,
    securityId: isCashLike || isOption ? null : resolvedSecurityId,
    underlyingSecurityId: isCashLike ? null : isOption ? resolvedSecurityId : null,
    optionId,
    type: row.normalized_type,
    action: normalizedTransaction.action,
    optionAction:
      normalizedTransaction.action === "BUY"
        ? "BUY_TO_OPEN"
        : normalizedTransaction.action === "SELL"
          ? "SELL_TO_CLOSE"
          : null,
    assetType: isCashLike ? normalizedTransaction.assetType : assetType,
    description: row.description,
    amount: requiredDecimal(statementAmount(row)),
    price: decimal(row.price),
    units: decimal(row.quantity),
    fee: decimal(row.commission) ?? "0.00",
    currencyCode,
    symbol: isCashLike ? null : canonicalSymbol,
    tradeDate: utcDate(row.transaction_date),
    rawData: statementRawData(row),
  };
}

function prepareStatementTransactions(
  data: ExtractedStatementData,
  accountsByNumber: Map<string, string>,
  securityLookup: SecurityLookup,
  securityTypesById: Map<string, string | null>,
  securitySymbolsById: Map<string, string>,
  securityCandidates: SecurityResolutionCandidate[],
  optionIdsByTicker: Map<string, string>,
  existingRows: ExistingTransactionRow[]
): {
  rows: PreparedStatementTransaction[];
  duplicateTransactionIdsToArchive: string[];
  inserted: number;
  updated: number;
  skipped: number;
} {
  const existingByImportKey = new Map<string, ExistingTransactionRow>();
  const existingByCompositeKey = new Map<string, ExistingTransactionRow[]>();

  for (const row of existingRows) {
    if (row.legacyImportKey) existingByImportKey.set(row.legacyImportKey, row);

    const keys = [
      transactionEconomicKey({
        accountId: row.accountId,
        symbol: row.symbol,
        tradeDate: row.tradeDate,
        amount: row.amount,
        units: row.units,
        currencyCode: row.currencyCode,
      }),
    ];
    const settlementDate = row.rawData?.settlementDate;
    if (typeof settlementDate === "string" && settlementDate) {
      keys.push(
        transactionEconomicKey({
          accountId: row.accountId,
          symbol: row.symbol,
          tradeDate: settlementDate,
          amount: row.amount,
          units: row.units,
          currencyCode: row.currencyCode,
        })
      );
    }
    for (const key of keys) {
      const matches = existingByCompositeKey.get(key) ?? [];
      if (!matches.some((match) => match.id === row.id)) matches.push(row);
      existingByCompositeKey.set(key, matches);
    }
  }

  const claimedExistingIds = new Set<string>();
  const plannedImportKeys = new Set<string>();
  const plannedCompositeKeys = new Set<string>();
  const duplicateTransactionIdsToArchive = new Set<string>();
  const rows: PreparedStatementTransaction[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const row of data.transactions) {
    const accountId = accountsByNumber.get(row.account_number)!;
    const value = buildStatementTransaction(
      row,
      accountId,
      securityLookup,
      securityTypesById,
      securitySymbolsById,
      securityCandidates,
      optionIdsByTicker
    );
    const importKey = value.legacyImportKey!;
    const compositeKeys = incomingTransactionKeys(accountId, row, value.symbol);

    if (
      plannedImportKeys.has(importKey) ||
      compositeKeys.some((key) => plannedCompositeKeys.has(key))
    ) {
      skipped += 1;
      continue;
    }

    const exactMatch = existingByImportKey.get(importKey);
    const compositeMatches = [
      ...new Map(
        compositeKeys
          .flatMap((key) => existingByCompositeKey.get(key) ?? [])
          .map((match) => [match.id, match])
      ).values(),
    ].filter((match) => !claimedExistingIds.has(match.id));

    const incomingCandidate: StoredTransactionLike = {
      id: `incoming:${row.import_key}`,
      accountId,
      source: STATEMENT_SOURCE,
      externalTransactionId: row.import_key,
      tradeDate: value.tradeDate,
      description: value.description,
      amount: value.amount,
      units: value.units,
      currencyCode: value.currencyCode,
      symbol: value.symbol,
      securityId: value.securityId,
    };
    const activeOtherSourceMatches = compositeMatches.filter(
      (match) => !match.isArchived && match.source !== STATEMENT_SOURCE
    );
    const preferredOtherSourceMatch = activeOtherSourceMatches.find(
      (match) =>
        preferredTransaction(
          {
            ...match,
            snaptradeTransactionId: null,
            externalTransactionId: null,
          },
          incomingCandidate
        ).id === match.id
    );
    let statementMatch =
      exactMatch?.source === STATEMENT_SOURCE ? exactMatch : null;
    if (!statementMatch && !preferredOtherSourceMatch) {
      statementMatch =
        compositeMatches.find((match) => match.source === STATEMENT_SOURCE) ??
        null;
    }

    if (
      exactMatch &&
      exactMatch.source !== STATEMENT_SOURCE &&
      preferredTransaction(
        {
          ...exactMatch,
          snaptradeTransactionId: null,
          externalTransactionId: null,
        },
        incomingCandidate
      ).id === exactMatch.id
    ) {
      skipped += 1;
      continue;
    }
    if (preferredOtherSourceMatch) {
      if (exactMatch?.source === STATEMENT_SOURCE) {
        duplicateTransactionIdsToArchive.add(exactMatch.id);
      }
      for (const match of compositeMatches) {
        if (match.source === STATEMENT_SOURCE) {
          duplicateTransactionIdsToArchive.add(match.id);
        }
      }
      skipped += 1;
      continue;
    }

    for (const match of activeOtherSourceMatches) {
      duplicateTransactionIdsToArchive.add(match.id);
    }

    if (statementMatch) {
      for (const match of compositeMatches) {
        if (
          match.source === STATEMENT_SOURCE &&
          match.id !== statementMatch.id
        ) {
          duplicateTransactionIdsToArchive.add(match.id);
        }
      }
      claimedExistingIds.add(statementMatch.id);
      value.legacyImportKey = statementMatch.legacyImportKey ?? importKey;
      rows.push({
        statementKey: row.statement_key,
        existingId: statementMatch.id,
        value,
      });
      updated += 1;
    } else {
      rows.push({
        statementKey: row.statement_key,
        existingId: null,
        value,
      });
      inserted += 1;
    }

    plannedImportKeys.add(importKey);
    for (const key of compositeKeys) plannedCompositeKeys.add(key);
  }

  return {
    rows,
    duplicateTransactionIdsToArchive: [...duplicateTransactionIdsToArchive],
    inserted,
    updated,
    skipped,
  };
}

async function repairStatementSecurityLinks(
  db: DB,
  rows: ExistingTransactionRow[],
  securityLookup: SecurityLookup,
  securityTypesById: Map<string, string | null>
): Promise<number> {
  let repaired = 0;

  for (const row of rows) {
    if (row.source !== STATEMENT_SOURCE || !row.symbol) continue;

    const parsedOption = parseOptionContract(row.description, row.symbol);
    const normalizedSymbol =
      parsedOption?.underlyingSymbol ??
      canonicalizeSymbol(row.symbol) ??
      row.symbol;
    const securityId = resolveSecurityId(
      securityLookup,
      normalizedSymbol,
      row.currencyCode
    );
    if (!securityId) continue;

    const isOption =
      parsedOption != null ||
      normalizedCompositeText(row.assetType) === "OPTION";
    const nextSecurityId = isOption ? null : securityId;
    const nextUnderlyingSecurityId = isOption ? securityId : null;
    const nextAssetType = isOption
      ? "OPTION"
      : normalizeSecurityType({
          category: securityTypesById.get(securityId),
          description: row.description,
          symbol: row.symbol,
        }) ??
        (row.type === "BUY" || row.type === "SELL" ? "STOCK" : "SECURITY");
    if (
      row.securityId === nextSecurityId &&
      row.underlyingSecurityId === nextUnderlyingSecurityId &&
      row.assetType === nextAssetType &&
      row.symbol === normalizedSymbol
    ) {
      continue;
    }

    await db
      .update(transactionsTable)
      .set({
        securityId: nextSecurityId,
        underlyingSecurityId: nextUnderlyingSecurityId,
        assetType: nextAssetType,
        symbol: normalizedSymbol,
      })
      .where(
        and(
          eq(transactionsTable.id, row.id),
          eq(transactionsTable.source, STATEMENT_SOURCE)
        )
      );
    repaired += 1;
  }

  return repaired;
}

function collectExistingStatementSecurityIdentities(
  rows: ExistingTransactionRow[]
): StatementSecurityIdentity[] {
  const identities = new Map<string, StatementSecurityIdentity>();

  for (const row of rows) {
    if (row.source !== STATEMENT_SOURCE || !row.symbol) continue;

    const key = identityKey(row.symbol, row.currencyCode);
    const rawSymbol =
      typeof row.rawData?.rawSymbol === "string"
        ? boundedSymbol(row.rawData.rawSymbol)
        : null;
    const current = identities.get(key);
    if (!current) {
      const profile = normalizeSecurityProfile({
        symbol: row.symbol,
        description: row.description,
        currencyCode: row.currencyCode,
        observedAt: row.tradeDate,
      });
      const isOption =
        normalizedCompositeText(row.assetType) === "OPTION";
      identities.set(key, {
        symbol: boundedSymbol(profile?.symbol ?? row.symbol)!,
        rawSymbol,
        currencyCode: row.currencyCode,
        description:
          profile?.description ??
          (isOption
            ? optionUnderlyingDescription(row.description) ?? row.symbol
            : row.description),
        instrumentTypeCode: isOption ? null : boundedSymbol(row.assetType),
        exchangeCode: profile?.exchangeCode ?? null,
        exchangeMicCode: profile?.exchangeMicCode ?? null,
        exchangeName: profile?.exchangeName ?? null,
        listingStatus: profile?.listingStatus ?? "ACTIVE",
        delistedAt: profile?.delistedAt ?? null,
        firstSeenAt: row.tradeDate,
        lastSeenAt: row.tradeDate,
      });
      continue;
    }

    current.firstSeenAt =
      row.tradeDate < current.firstSeenAt ? row.tradeDate : current.firstSeenAt;
    current.lastSeenAt =
      row.tradeDate > current.lastSeenAt ? row.tradeDate : current.lastSeenAt;
    if (!current.rawSymbol) current.rawSymbol = rawSymbol;
    if (
      (!current.description || current.description === current.symbol) &&
      row.description &&
      normalizedCompositeText(row.assetType) !== "OPTION"
    ) {
      current.description = row.description;
    }
  }

  return [...identities.values()];
}

export async function repairQuestradeStatementSecurityLinks(
  db: DB,
  accountIds?: string[]
): Promise<{
  securitiesUpserted: number;
  aliasesUpserted: number;
  transactionsRepaired: number;
}> {
  if (accountIds && accountIds.length === 0) {
    return {
      securitiesUpserted: 0,
      aliasesUpserted: 0,
      transactionsRepaired: 0,
    };
  }

  const [securityRows, aliasRows, statementRows] = await Promise.all([
    db.select({
      id: securities.id,
      securityKey: securities.securityKey,
      source: securities.source,
      snaptradeSymbolId: securities.snaptradeSymbolId,
      symbol: securities.symbol,
      rawSymbol: securities.rawSymbol,
      currencyCode: securities.currencyCode,
      exchangeCode: securities.exchangeCode,
      exchangeMicCode: securities.exchangeMicCode,
      figiCode: securities.figiCode,
      description: securities.description,
      instrumentTypeCode: securities.instrumentTypeCode,
    }).from(securities).where(eq(securities.isArchived, false)),
    db.select({
      securityId: securityAliases.securityId,
      source: securityAliases.source,
      externalId: securityAliases.externalId,
      symbol: securityAliases.symbol,
      rawSymbol: securityAliases.rawSymbol,
      currencyCode: securityAliases.currencyCode,
      exchangeCode: securityAliases.exchangeCode,
      exchangeMicCode: securityAliases.exchangeMicCode,
    }).from(securityAliases).where(eq(securityAliases.isArchived, false)),
    db
      .select({
        id: transactionsTable.id,
        source: transactionsTable.source,
        isArchived: transactionsTable.isArchived,
        accountId: transactionsTable.accountId,
        securityId: transactionsTable.securityId,
        underlyingSecurityId: transactionsTable.underlyingSecurityId,
        assetType: transactionsTable.assetType,
        symbol: transactionsTable.symbol,
        description: transactionsTable.description,
        type: transactionsTable.type,
        amount: transactionsTable.amount,
        units: transactionsTable.units,
        currencyCode: transactionsTable.currencyCode,
        tradeDate: transactionsTable.tradeDate,
        legacyImportKey: transactionsTable.legacyImportKey,
        rawData: transactionsTable.rawData,
      })
      .from(transactionsTable)
      .where(
        accountIds
          ? and(
              eq(transactionsTable.source, STATEMENT_SOURCE),
              inArray(transactionsTable.accountId, accountIds),
              sql`${transactionsTable.symbol} is not null`
            )
          : and(
              eq(transactionsTable.source, STATEMENT_SOURCE),
              sql`${transactionsTable.symbol} is not null`
            )
      ),
  ]);

  const lookup = buildSecurityLookup(securityRows, aliasRows);
  const securityTypesById = new Map(
    securityRows.map((security) => [security.id, security.instrumentTypeCode])
  );
  const securitySymbolsById = new Map(
    securityRows.map((security) => [security.id, security.symbol])
  );
  const identities =
    collectExistingStatementSecurityIdentities(statementRows);

  return db.transaction(async (tx) => {
    const securityResult = await ensureStatementSecurities(
      tx,
      lookup,
      identities,
      securityTypesById,
      securitySymbolsById
    );
    const transactionsRepaired = await repairStatementSecurityLinks(
      tx,
      statementRows,
      lookup,
      securityTypesById
    );
    return {
      ...securityResult,
      transactionsRepaired,
    };
  });
}

function assertImportable(
  data: ExtractedStatementData,
  allowErrors: boolean
): void {
  const statementKeys = new Set(
    data.statements.map((statement) => statement.statement_key)
  );
  const duplicateKeys = data.statements
    .map((statement) => statement.statement_key)
    .filter((key, index, keys) => keys.indexOf(key) !== index);
  if (duplicateKeys.length > 0) {
    throw new Error(
      `Duplicate statements cannot be imported: ${[...new Set(duplicateKeys)].join(", ")}`
    );
  }

  const orphanStatementKeys = [
    ...data.cashBalances,
    ...data.holdings,
    ...data.transactions,
  ]
    .map((row) => row.statement_key)
    .filter((key) => !statementKeys.has(key));
  if (orphanStatementKeys.length > 0) {
    throw new Error(
      `Extracted rows reference missing statements: ${[
        ...new Set(orphanStatementKeys),
      ].join(", ")}`
    );
  }

  const errors = data.issues.filter((issue) => issue.severity === "ERROR");
  if (!allowErrors && errors.length > 0) {
    const preview = errors
      .slice(0, 5)
      .map((issue) => `${issue.source_file}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Refusing to import ${errors.length} extraction error(s). Review the Excel output or rerun with --allow-errors.\n${preview}`
    );
  }
}

export async function saveExtractedStatements(
  db: DB,
  data: ExtractedStatementData,
  options: DatabaseImportOptions = {}
): Promise<DatabaseImportSummary> {
  assertImportable(data, options.allowErrors ?? false);

  const [accountRows, securityRows, aliasRows] = await Promise.all([
    db.select({
      id: accounts.id,
      brokerageAccountNumber: accounts.brokerageAccountNumber,
      isArchived: accounts.isArchived,
    }).from(accounts),
    db.select({
      id: securities.id,
      securityKey: securities.securityKey,
      source: securities.source,
      snaptradeSymbolId: securities.snaptradeSymbolId,
      symbol: securities.symbol,
      rawSymbol: securities.rawSymbol,
      currencyCode: securities.currencyCode,
      exchangeCode: securities.exchangeCode,
      exchangeMicCode: securities.exchangeMicCode,
      figiCode: securities.figiCode,
      description: securities.description,
      instrumentTypeCode: securities.instrumentTypeCode,
    }).from(securities).where(eq(securities.isArchived, false)),
    db.select({
      securityId: securityAliases.securityId,
      source: securityAliases.source,
      externalId: securityAliases.externalId,
      symbol: securityAliases.symbol,
      rawSymbol: securityAliases.rawSymbol,
      currencyCode: securityAliases.currencyCode,
      exchangeCode: securityAliases.exchangeCode,
      exchangeMicCode: securityAliases.exchangeMicCode,
    }).from(securityAliases).where(eq(securityAliases.isArchived, false)),
  ]);

  const accountMatchesByNumber = new Map<
    string,
    { id: string; isArchived: boolean }
  >();
  for (const account of accountRows) {
    if (!account.brokerageAccountNumber) continue;

    const current = accountMatchesByNumber.get(account.brokerageAccountNumber);
    if (!current || (current.isArchived && !account.isArchived)) {
      accountMatchesByNumber.set(account.brokerageAccountNumber, {
        id: account.id,
        isArchived: account.isArchived,
      });
    }
  }
  const accountsByNumber = new Map(
    [...accountMatchesByNumber].map(([accountNumber, account]) => [
      accountNumber,
      account.id,
    ])
  );
  const missingAccounts = [
    ...new Set(
      data.statements
        .map((statement) => statement.account_number)
        .filter((accountNumber) => !accountsByNumber.has(accountNumber))
    ),
  ];
  if (missingAccounts.length > 0) {
    throw new Error(
      `No application account matches Questrade account number(s): ${missingAccounts.join(", ")}`
    );
  }

  const securityLookup = buildSecurityLookup(securityRows, aliasRows);
  const securityTypesById = new Map(
    securityRows.map((security) => [security.id, security.instrumentTypeCode])
  );
  const securitySymbolsById = new Map(
    securityRows.map((security) => [security.id, security.symbol])
  );
  const securityCandidates: SecurityResolutionCandidate[] = securityRows.map(
    (security) => ({
      id: security.id,
      securityKey: security.securityKey,
      source: security.source,
      symbol: security.symbol,
      rawSymbol: security.rawSymbol,
      description: security.description,
      currencyCode: security.currencyCode,
      snaptradeSymbolId: security.snaptradeSymbolId,
      figiCode: security.figiCode,
      instrumentTypeCode: security.instrumentTypeCode,
    })
  );

  const relevantAccountIds = [...new Set(data.statements.map((statement) =>
    accountsByNumber.get(statement.account_number)!
  ))];
  const existingTransactionRows = relevantAccountIds.length === 0
    ? []
    : await db
      .select({
        id: transactionsTable.id,
        source: transactionsTable.source,
        isArchived: transactionsTable.isArchived,
        accountId: transactionsTable.accountId,
        securityId: transactionsTable.securityId,
        underlyingSecurityId: transactionsTable.underlyingSecurityId,
        assetType: transactionsTable.assetType,
        symbol: transactionsTable.symbol,
        description: transactionsTable.description,
        type: transactionsTable.type,
        amount: transactionsTable.amount,
        units: transactionsTable.units,
        currencyCode: transactionsTable.currencyCode,
        tradeDate: transactionsTable.tradeDate,
        legacyImportKey: transactionsTable.legacyImportKey,
        rawData: transactionsTable.rawData,
      })
      .from(transactionsTable)
      .where(
        and(
          inArray(transactionsTable.accountId, relevantAccountIds),
          sql`(${transactionsTable.isArchived} = false or ${transactionsTable.source} = ${STATEMENT_SOURCE})`
        )
      );

  const statementSecurityIdentities =
    collectStatementSecurityIdentities(data);
  if (options.dryRun) {
    const prepared = prepareStatementTransactions(
      data,
      accountsByNumber,
      securityLookup,
      securityTypesById,
      securitySymbolsById,
      securityCandidates,
      new Map(),
      existingTransactionRows
    );
    return {
      dryRun: true,
      statements: data.statements.length,
      cashBalances: data.cashBalances.length,
      holdings: data.holdings.length,
      transactions: prepared.rows.length,
      transactionsSkipped: prepared.skipped,
      warnings: data.issues.filter((issue) => issue.severity === "WARNING").length,
    };
  }

  const archivedAccountIdsToReactivate = [
    ...new Set(
      data.statements
        .map((statement) =>
          accountMatchesByNumber.get(statement.account_number)
        )
        .filter((account) => account?.isArchived)
        .map((account) => account!.id)
    ),
  ];
  const latestStatementByAccount = new Map<string, (typeof data.statements)[number]>();
  for (const statement of data.statements) {
    const current = latestStatementByAccount.get(statement.account_number);
    if (!current || statement.statement_date > current.statement_date) {
      latestStatementByAccount.set(statement.account_number, statement);
    }
  }

  const transactionImportResult = await db.transaction(async (tx) => {
    await ensureStatementSecurities(
      tx,
      securityLookup,
      statementSecurityIdentities,
      securityTypesById,
      securitySymbolsById
    );
    const optionIdsByTicker = await ensureStatementOptions(
      tx,
      data,
      securityLookup
    );
    const preparedTransactions = prepareStatementTransactions(
      data,
      accountsByNumber,
      securityLookup,
      securityTypesById,
      securitySymbolsById,
      securityCandidates,
      optionIdsByTicker,
      existingTransactionRows
    );
    if (preparedTransactions.duplicateTransactionIdsToArchive.length > 0) {
      await tx
        .update(transactionsTable)
        .set({ isArchived: true })
        .where(
          inArray(
            transactionsTable.id,
            preparedTransactions.duplicateTransactionIdsToArchive
          )
        );
    }

    if (archivedAccountIdsToReactivate.length > 0) {
      await tx
        .update(accounts)
        .set({ isArchived: false })
        .where(inArray(accounts.id, archivedAccountIdsToReactivate));
    }

    for (const statement of data.statements) {
      const accountId = accountsByNumber.get(statement.account_number)!;
      await tx.delete(holdingsTable).where(and(
        eq(holdingsTable.accountId, accountId),
        eq(holdingsTable.asOfDate, statement.statement_date),
        eq(holdingsTable.source, STATEMENT_SOURCE)
      ));

      const holdingRows = rowsForStatement(data.holdings, statement.statement_key)
        .map((row) => {
          const resolvedSecurityId = resolveSecurityId(
            securityLookup,
            row.symbol,
            row.currency_code
          );
          const isOption = row.asset_type === "OPTION";
          return {
            accountId,
            securityId: isOption ? null : resolvedSecurityId,
            underlyingSecurityId: isOption ? resolvedSecurityId : null,
            importKey: holdingImportKey(accountId, row),
            source: STATEMENT_SOURCE,
            sourceFile: row.source_file,
            sourcePage: row.source_page,
            asOfDate: row.statement_date,
            category: row.category,
            currencyCode: row.currency_code,
            optionType: row.option_type,
            rawSymbol: row.raw_symbol,
            symbol: row.symbol,
            description: row.description,
            costBasis: row.cost_basis,
            quantity: decimal(row.quantity),
            positionCost: decimal(row.position_cost),
            marketPrice: decimal(row.market_price),
            marketValue: decimal(row.market_value),
          };
        });
      if (holdingRows.length > 0) {
        await tx.insert(holdingsTable).values(holdingRows);
      }

      const statementTransactions = preparedTransactions.rows.filter(
        (row) => row.statementKey === statement.statement_key
      );
      for (const row of statementTransactions.filter(
        (transaction) => transaction.existingId !== null
      )) {
        await tx
          .update(transactionsTable)
          .set({ ...row.value, isArchived: false })
          .where(
            and(
              eq(transactionsTable.id, row.existingId!),
              eq(transactionsTable.source, STATEMENT_SOURCE)
            )
          );
      }

      const newTransactionRows = statementTransactions
        .filter((row) => row.existingId === null)
        .map((row) => row.value);
      if (newTransactionRows.length > 0) {
        await tx
          .insert(transactionsTable)
          .values(newTransactionRows)
          .onConflictDoUpdate({
            target: [transactionsTable.legacyImportKey],
            set: {
              source: sql`excluded.source`,
              externalTransactionId: sql`excluded.external_transaction_id`,
              isArchived: false,
              accountId: sql`excluded.account_id`,
              securityId: sql`excluded.security_id`,
              underlyingSecurityId: sql`excluded.underlying_security_id`,
              optionId: sql`excluded.option_id`,
              type: sql`excluded.type`,
              action: sql`excluded.action`,
              optionAction: sql`excluded.option_action`,
              assetType: sql`excluded.asset_type`,
              description: sql`excluded.description`,
              amount: sql`excluded.amount`,
              price: sql`excluded.price`,
              units: sql`excluded.units`,
              fee: sql`excluded.fee`,
              currencyCode: sql`excluded.currency_code`,
              symbol: sql`excluded.symbol`,
              tradeDate: sql`excluded.trade_date`,
              rawData: sql`excluded.raw_data`,
            },
          });
      }
    }

    await repairStatementSecurityLinks(
      tx,
      existingTransactionRows,
      securityLookup,
      securityTypesById
    );

    for (const [accountNumber, statement] of latestStatementByAccount) {
      const accountId = accountsByNumber.get(accountNumber)!;
      const cashRows = rowsForStatement(data.cashBalances, statement.statement_key);
      for (const row of cashRows) {
        const [existing] = await tx
          .select({
            source: accountBalances.source,
            asOfDate: accountBalances.asOfDate,
          })
          .from(accountBalances)
          .where(and(
            eq(accountBalances.accountId, accountId),
            eq(accountBalances.currencyCode, row.currency_code)
          ))
          .limit(1);

        if (existing?.source !== undefined && existing.source !== STATEMENT_SOURCE) {
          continue;
        }
        if (existing?.asOfDate && existing.asOfDate > statement.statement_date) {
          continue;
        }

        await tx
          .insert(accountBalances)
          .values({
            accountId,
            currencyCode: row.currency_code,
            cash: requiredDecimal(row.total_amount),
            buyingPower: null,
            source: STATEMENT_SOURCE,
            sourceFile: statement.source_file,
            asOfDate: statement.statement_date,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [accountBalances.accountId, accountBalances.currencyCode],
            set: {
              cash: sql`excluded.cash`,
              buyingPower: sql`excluded.buying_power`,
              source: sql`excluded.source`,
              sourceFile: sql`excluded.source_file`,
              asOfDate: sql`excluded.as_of_date`,
              syncedAt: sql`excluded.synced_at`,
            },
            setWhere: eq(accountBalances.source, STATEMENT_SOURCE),
          });
      }
    }

    return preparedTransactions;
  });

  return {
    dryRun: false,
    statements: data.statements.length,
    cashBalances: data.cashBalances.length,
    holdings: data.holdings.length,
    transactions: transactionImportResult.rows.length,
    transactionsSkipped: transactionImportResult.skipped,
    warnings: data.issues.filter((issue) => issue.severity === "WARNING").length,
  };
}
