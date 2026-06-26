import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accounts,
  db,
  eq,
  inArray,
  securities,
  transactions,
  users,
  upsertSecurities,
  upsertSecurityAliases,
  type Account,
  type NewAccount,
  type NewSecurityAlias,
  type NewSecurity,
  type NewTransaction,
  type Security,
} from "../../packages/db/dist/index.js";

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

const source = "Questrade Legacy";
const defaultDumpPath = "C:\\Users\\px13\\Documents\\Projects\\sqlite_dump.sql";

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

function normalizeSymbol(symbol: string | null | undefined): string {
  if (!symbol) return "__NO_SYMBOL__";
  return stripCanadianSuffix(symbol.trim());
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

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function duplicateKey(input: {
  accountId: string;
  symbol: string | null;
  tradeDate: Date;
  amount: string | number | null;
  currency: string | null;
}): string {
  return [
    input.accountId,
    normalizeSymbol(input.symbol),
    dateKey(input.tradeDate),
    money(input.amount == null ? null : String(input.amount)),
    input.currency?.trim().toUpperCase() ?? "",
  ].join("|");
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

function transactionDescription(activity: LegacyActivity): string {
  return [activity.type, activity.subType, activity.action, activity.status]
    .filter(Boolean)
    .join(" / ");
}

function legacyImportKey(activity: LegacyActivity, accountId: string, currency: string | null): string {
  return duplicateKey({
    accountId,
    symbol: activity.symbol,
    tradeDate: activity.filledAt ?? activity.submittedAt ?? activity.lastUpdated ?? activity.createdAt,
    amount: activity.amount,
    currency,
  });
}

function generatedLegacyId(key: string): string {
  const hash = createHash("sha1").update(`${source}:${key}`).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join("-");
}

function parseDump(path: string) {
  const contents = readFileSync(path, "utf8");
  const accountsByNumber = new Map<string, LegacyAccount>();
  const securitiesById = new Map<string, LegacySecurity>();
  const activities: LegacyActivity[] = [];

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
    }
  }

  return {
    accounts: [...accountsByNumber.values()],
    securities: [...securitiesById.values()],
    activities,
    securitiesById,
  };
}

async function main() {
  const dumpPath = resolve(process.argv[2] ?? defaultDumpPath);
  if (!existsSync(dumpPath)) {
    throw new Error(`SQLite dump not found: ${dumpPath}`);
  }

  const parsed = parseDump(dumpPath);
  const user = (await db.select().from(users).limit(1))[0];
  if (!user) throw new Error("No user exists. Run the normal seed/sync first.");

  const renamedLegacyTransactions = await db
    .update(transactions)
    .set({ source })
    .where(eq(transactions.source, "LEGACY_SQLITE"))
    .returning({ id: transactions.id });

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
      type: normalizeAccountType(account.type),
      name: `${account.brokerName ?? "Legacy"} ${normalizeAccountType(account.type)} ${account.currency}`,
      linkedAccountId: account.linkedAccountId,
      firstTransactionDate: null,
      lastTransactionsSyncAt: account.lastSynced,
      lastHoldingsSyncAt: account.lastSynced,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

  const legacyQuestradeAccountNumbers = parsed.accounts
    .filter((account) => account.brokerName === "Questrade")
    .map((account) => account.accountNumber);
  const closedLegacyAccounts =
    legacyQuestradeAccountNumbers.length === 0
      ? []
      : await db
          .update(accounts)
          .set({ status: "closed" })
          .where(inArray(accounts.brokerageAccountNumber, legacyQuestradeAccountNumbers))
          .returning({
            id: accounts.id,
            brokerageAccountNumber: accounts.brokerageAccountNumber,
          });

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
    securitiesByLookup.set(`${security.securityKey}|`, security);
  }

  for (const security of currentSecurities) addSecurityLookup(security);

  const missingSecurities: NewSecurity[] = [];
  for (const legacySecurity of parsed.securities) {
    const legacyKey = `legacy-security:${legacySecurity.id}`;
    const existingByLegacyKey = currentSecurities.find(
      (security) => security.securityKey === legacyKey
    );
    const existingBySymbol = securityLookupKeys(
      legacySecurity.symbol,
      legacySecurity.currency
    )
      .map((key) => securitiesByLookup.get(key))
      .find(Boolean);

    if (existingByLegacyKey || existingBySymbol) {
      securitiesByLegacyId.set(legacySecurity.id, existingByLegacyKey ?? existingBySymbol!);
      continue;
    }

    missingSecurities.push({
      securityKey: legacyKey,
      snaptradeSymbolId: null,
      symbol: legacySecurity.symbol,
      rawSymbol: stripCanadianSuffix(legacySecurity.symbol),
      description: legacySecurity.name ?? legacySecurity.description,
      currencyCode: legacySecurity.currency,
      exchangeCode: legacySecurity.exchange,
      exchangeMicCode: null,
      exchangeName: legacySecurity.exchange,
      instrumentTypeCode: null,
      instrumentTypeDescription: legacySecurity.type,
      figiCode: null,
      figiInstrumentCode: null,
      logoUrl: null,
      firstSeenAt: legacySecurity.createdAt,
      lastSeenAt: legacySecurity.lastSynced,
    });
  }

  const insertedSecurities = await upsertSecurities(db, missingSecurities);
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

    const aliasKey = `${source}|${legacySecurity.id}`;
    if (aliasKeys.has(aliasKey)) continue;
    aliasKeys.add(aliasKey);

    aliasInputs.push({
      securityId: security.id,
      source,
      externalId: legacySecurity.id,
      symbol: legacySecurity.symbol,
      rawSymbol: stripCanadianSuffix(legacySecurity.symbol),
      currencyCode: legacySecurity.currency,
      exchangeCode: legacySecurity.exchange,
      exchangeMicCode: null,
    });
  }

  const upsertedAliases = await upsertSecurityAliases(db, aliasInputs);

  const existingTransactions = await db.select().from(transactions);
  const existingExternalIds = new Set(
    existingTransactions
      .filter((transaction) => transaction.source === source && transaction.externalTransactionId)
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
        tradeDate: transaction.tradeDate,
        amount: transaction.amount,
        currency: transaction.currencyCode,
      })
    );
  }

  let exactDuplicates = 0;
  let probableDuplicates = 0;
  const unresolvedAccounts = new Set<string>();
  const unresolvedSecurities = new Set<string>();
  const transactionInputs: NewTransaction[] = [];

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
    const key = legacyImportKey(activity, account.id, currency);
    if (existingDuplicateKeys.has(key)) {
      probableDuplicates += 1;
      continue;
    }

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
    const symbol = activity.symbol ?? legacySecurity?.symbol ?? security?.symbol ?? null;

    transactionInputs.push({
      snaptradeTransactionId: null,
      source,
      externalTransactionId: activity.id,
      legacyImportKey: key,
      accountId: account.id,
      securityId: security?.id ?? null,
      type: transactionType(activity),
      description: transactionDescription(activity),
      amount: money(activity.amount),
      price: numeric(activity.price, 6),
      units: numeric(activity.quantity, 6),
      fee: money(activity.commission, "0"),
      currencyCode: currency.slice(0, 3),
      symbol: symbol?.slice(0, 20) ?? null,
      tradeDate,
      createdAt: activity.createdAt,
    });
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
        },
        matchedOrCreated: {
          createdAccounts: missingAccounts.length,
          createdSecurities: insertedSecurities.length,
          upsertedSecurityAliases: upsertedAliases.length,
          renamedLegacyTransactions: renamedLegacyTransactions.length,
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
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
  });
