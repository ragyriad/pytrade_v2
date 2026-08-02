import * as dotenv from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";
import {
  canonicalizeSymbol,
  normalizeSecurityProfile,
  normalizeSecurityIdentity,
  optionUnderlyingDescription,
  normalizeTransaction,
  parseOptionContract,
  resolveSecurityCandidate,
  type SecurityResolutionCandidate,
} from "@repo/data-normalizer";

dotenv.config({ path: resolve(process.cwd(), ".env"), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type TransactionRow = {
  id: string;
  source: string;
  type: string;
  action: string | null;
  asset_type: string | null;
  description: string | null;
  symbol: string | null;
  currency_code: string | null;
  security_id: string | null;
  underlying_security_id: string | null;
  option_id: string | null;
  option_action: string | null;
  amount: string | number;
  units: string | number | null;
  account_type: string | null;
  security_symbol: string | null;
  security_raw_symbol: string | null;
  security_description: string | null;
  instrument_type_code: string | null;
  instrument_type_description: string | null;
  raw_data: Record<string, unknown> | null;
};

type SecurityRow = SecurityResolutionCandidate & {
  securityKey: string;
  listingStatus: string;
  delistedAt: Date | string | null;
  exchangeCode: string | null;
  exchangeMicCode: string | null;
  exchangeName: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  instrumentTypeCode: string | null;
  instrumentTypeDescription: string | null;
};

function dateOnly(value: Date | string | null): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value.slice(0, 10);
}

function groupKey(action: string, assetType: string): string {
  return `${action} / ${assetType}`;
}

function isCashAccount(accountType: string | null): boolean {
  const normalized = accountType?.trim().toUpperCase();
  return (
    normalized === "CASH"
    || normalized === "CASH_USD"
    || normalized === "CASH_CAD"
    || normalized === "CREDIT_CARD"
  );
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
  const preserveActions = process.argv.includes("--preserve-actions");
  const includeArchived = process.argv.includes("--include-archived");
  await ensureColumns();

  const rows = await client<TransactionRow[]>`
    select
      transactions.id,
      transactions.source,
      transactions.type,
      transactions.action,
      transactions.asset_type,
      transactions.description,
      transactions.symbol,
      transactions.currency_code,
      transactions.security_id,
      transactions.underlying_security_id,
      transactions.option_id,
      transactions.option_action,
      transactions.amount,
      transactions.units,
      accounts.type as account_type,
      securities.symbol as security_symbol,
      securities.raw_symbol as security_raw_symbol,
      securities.description as security_description,
      securities.instrument_type_code,
      securities.instrument_type_description,
      transactions.raw_data
    from transactions
    join accounts on transactions.account_id = accounts.id
    left join securities on transactions.security_id = securities.id
    where ${includeArchived} or transactions.is_archived = false
  `;
  const securityRows = await client<SecurityRow[]>`
    select
      id,
      security_key as "securityKey",
      source,
      symbol,
      raw_symbol as "rawSymbol",
      description,
      currency_code as "currencyCode",
      is_archived as "isArchived",
      snaptrade_symbol_id as "snaptradeSymbolId",
      figi_code as "figiCode",
      listing_status as "listingStatus",
      delisted_at as "delistedAt",
      exchange_code as "exchangeCode",
      exchange_mic_code as "exchangeMicCode",
      exchange_name as "exchangeName",
      first_seen_at as "firstSeenAt",
      last_seen_at as "lastSeenAt",
      instrument_type_code as "instrumentTypeCode",
      instrument_type_description as "instrumentTypeDescription"
    from securities
    where ${includeArchived} or is_archived = false
  `;

  const securityChanges = securityRows
    .map((row) => {
      const contractSecurity = row.securityKey.startsWith("option:");
      const parsedOption = parseOptionContract(
        row.description,
        row.rawSymbol,
        row.symbol
      );
      const normalizedIdentity = normalizeSecurityIdentity({
        securityKey: row.securityKey,
        symbol: row.symbol,
        rawSymbol: row.rawSymbol,
        description: row.description,
      });
      const linkedTransactionProfiles = rows
        .filter(
          (transaction) =>
            transaction.security_id === row.id ||
            transaction.underlying_security_id === row.id
        )
        .map((transaction) =>
          normalizeSecurityProfile({
            symbol: transaction.symbol ?? row.symbol,
            description: transaction.description,
            currencyCode: transaction.currency_code,
            observedAt: row.lastSeenAt ?? row.firstSeenAt,
          })
        )
        .filter(
          (value): value is NonNullable<typeof value> => value !== null
        );
      const profile =
        linkedTransactionProfiles[0] ??
        normalizeSecurityProfile({
          symbol: parsedOption?.underlyingSymbol ?? row.symbol,
          description: row.description,
          currencyCode: row.currencyCode,
          observedAt: row.lastSeenAt ?? row.firstSeenAt,
        });
      const nextSymbol =
        profile?.symbol ??
        normalizedIdentity.symbol ??
        row.symbol;
      const nextRawSymbol =
        normalizedIdentity.rawSymbol ??
        (contractSecurity ? row.symbol : row.rawSymbol);
      const siblingDescription = securityRows
        .filter(
          (candidate) =>
            candidate.id !== row.id &&
            !candidate.securityKey.startsWith("option:") &&
            canonicalizeSymbol(candidate.symbol) ===
              canonicalizeSymbol(nextSymbol) &&
            (!row.currencyCode ||
              !candidate.currencyCode ||
              candidate.currencyCode === row.currencyCode) &&
            !parseOptionContract(
              candidate.description,
              candidate.rawSymbol,
              candidate.symbol
            ) &&
            candidate.instrumentTypeCode?.trim().toUpperCase() !== "OPTION"
        )
        .sort((left, right) => {
          const sourceRank = (source: string | null | undefined) =>
            source?.trim().toUpperCase() === "SNAPTRADE" ? 1 : 0;
          return sourceRank(right.source) - sourceRank(left.source);
        })[0]?.description;
      const nextDescription =
        profile?.description ??
        (!contractSecurity && parsedOption
          ? optionUnderlyingDescription(row.description) ??
            siblingDescription ??
            nextSymbol
          : row.description);
      const hadOptionType =
        row.instrumentTypeCode?.trim().toUpperCase() === "OPTION" ||
        row.instrumentTypeDescription?.trim().toUpperCase() === "OPTION";

      return {
        row,
        nextSymbol,
        nextRawSymbol,
        nextDescription,
        nextInstrumentTypeCode: hadOptionType
          ? null
          : row.instrumentTypeCode,
        nextInstrumentTypeDescription: hadOptionType
          ? null
          : row.instrumentTypeDescription,
        nextExchangeCode: profile?.exchangeCode ?? row.exchangeCode,
        nextExchangeMicCode:
          profile?.exchangeMicCode ?? row.exchangeMicCode,
        nextExchangeName: profile?.exchangeName ?? row.exchangeName,
        nextListingStatus:
          profile?.listingStatus ?? row.listingStatus,
        nextDelistedAt:
          profile?.delistedAt ?? dateOnly(row.delistedAt),
      };
    })
    .filter(
      (change) =>
        change.row.symbol !== change.nextSymbol ||
        change.row.rawSymbol !== change.nextRawSymbol ||
        change.row.description !== change.nextDescription ||
        change.row.instrumentTypeCode !==
          change.nextInstrumentTypeCode ||
        change.row.instrumentTypeDescription !==
          change.nextInstrumentTypeDescription ||
        change.row.exchangeCode !== change.nextExchangeCode ||
        change.row.exchangeMicCode !== change.nextExchangeMicCode ||
        change.row.exchangeName !== change.nextExchangeName ||
        change.row.listingStatus !== change.nextListingStatus ||
        dateOnly(change.row.delistedAt) !== change.nextDelistedAt
    );

  const planned = rows.map((row) => {
    const parsedOption = parseOptionContract(
      row.description,
      row.symbol,
      row.security_raw_symbol,
      row.security_description
    );
    const resolvedSecurity = resolveSecurityCandidate(
      {
        symbol: parsedOption?.underlyingSymbol ?? row.symbol,
        description: row.description,
        currencyCode: row.currency_code,
        rawData: row.raw_data,
      },
      securityRows
    );
    const normalized = normalizeTransaction(
      {
        type: row.action ?? row.type,
        description: row.description,
        symbol: row.symbol,
        amount: row.amount,
        units: row.units,
      },
      resolvedSecurity
        ? {
            symbol: resolvedSecurity.symbol,
            rawSymbol: resolvedSecurity.rawSymbol,
            description: resolvedSecurity.description,
            instrumentTypeCode: resolvedSecurity.instrumentTypeCode,
            instrumentTypeDescription:
              resolvedSecurity.instrumentTypeDescription,
          }
        : {
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
    const shouldClearSecurity =
      cashAccount
      || normalized.assetType === "CASH"
      || normalized.assetType === "INTEREST"
      || isCashPlaceholderSymbol(
        row.symbol,
        row.currency_code,
        normalized.action
      );

    const canonicalSymbol =
      parsedOption?.underlyingSymbol ??
      resolvedSecurity?.symbol ??
      canonicalizeSymbol(row.symbol);
    const nextSecurityId =
      shouldClearSecurity
        ? null
        : row.security_id ??
          (normalized.assetType === "OPTION" ? null : resolvedSecurity?.id ?? null);
    const nextUnderlyingSecurityId =
      shouldClearSecurity
        ? null
        : row.underlying_security_id ??
          (normalized.assetType === "OPTION" ? resolvedSecurity?.id ?? null : null);
    const nextOptionId = shouldClearSecurity ? null : row.option_id;
    const nextOptionAction = shouldClearSecurity ? null : row.option_action;

    return {
      row,
      normalized,
      nextAction: preserveActions ? row.action : normalized.action,
      nextType,
      nextSymbol: shouldClearSecurity ? null : canonicalSymbol,
      nextSecurityId,
      nextUnderlyingSecurityId,
      nextOptionId,
      nextOptionAction,
    };
  });

  const changes = planned.filter(
    ({
      row,
      normalized,
      nextAction,
      nextType,
      nextSymbol,
      nextSecurityId,
      nextUnderlyingSecurityId,
      nextOptionId,
      nextOptionAction,
    }) =>
      row.type !== nextType ||
      row.action !== nextAction ||
      row.asset_type !== normalized.assetType ||
      row.symbol !== nextSymbol ||
      row.security_id !== nextSecurityId ||
      row.underlying_security_id !== nextUnderlyingSecurityId ||
      row.option_id !== nextOptionId ||
      row.option_action !== nextOptionAction
  );

  const summary = new Map<string, number>();
  for (const { normalized, nextAction } of planned) {
    const key = groupKey(nextAction ?? normalized.action, normalized.assetType);
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }

  console.log("Normalized transaction summary:");
  for (const [key, count] of [...summary.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
  console.log("");
  console.log(`${changes.length} transactions need normalized action/type updates.`);
  console.log(`${securityChanges.length} securities need identity/type/lifecycle updates.`);
  const sampledSecurityChanges = [...securityChanges].sort((left, right) => {
    const leftPriority =
      Number(!left.row.securityKey.startsWith("option:")) +
      Number(left.nextListingStatus === "DELISTED");
    const rightPriority =
      Number(!right.row.securityKey.startsWith("option:")) +
      Number(right.nextListingStatus === "DELISTED");
    return rightPriority - leftPriority;
  });
  for (const change of sampledSecurityChanges.slice(0, 20)) {
    console.log(
      `  ${change.row.id} [${change.row.source}]: ` +
        JSON.stringify({
          symbol: [change.row.symbol, change.nextSymbol],
          rawSymbol: [change.row.rawSymbol, change.nextRawSymbol],
          description: [
            change.row.description,
            change.nextDescription,
          ],
          instrumentType: [
            change.row.instrumentTypeCode,
            change.nextInstrumentTypeCode,
          ],
          exchange: [
            change.row.exchangeCode,
            change.nextExchangeCode,
          ],
          listingStatus: [
            change.row.listingStatus,
            change.nextListingStatus,
          ],
          delistedAt: [change.row.delistedAt, change.nextDelistedAt],
        })
    );
  }
  if (changes.length > 0) {
    const bySource = new Map<string, number>();
    const byField = new Map<string, number>();
    for (const change of changes) {
      bySource.set(
        change.row.source,
        (bySource.get(change.row.source) ?? 0) + 1
      );
      const fields = [
        change.row.type !== change.nextType ? "type" : null,
        change.row.action !== change.nextAction ? "action" : null,
        change.row.asset_type !== change.normalized.assetType
          ? "asset_type"
          : null,
        change.row.symbol !== change.nextSymbol ? "symbol" : null,
        change.row.security_id !== change.nextSecurityId
          ? "security_id"
          : null,
        change.row.underlying_security_id !==
        change.nextUnderlyingSecurityId
          ? "underlying_security_id"
          : null,
        change.row.option_id !== change.nextOptionId ? "option_id" : null,
        change.row.option_action !== change.nextOptionAction
          ? "option_action"
          : null,
      ].filter((field): field is string => field !== null);
      for (const field of fields) {
        byField.set(field, (byField.get(field) ?? 0) + 1);
      }
    }

    console.log("Changes by source:");
    for (const [source, count] of [...bySource.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${source}: ${count}`);
    }
    console.log("Changed fields:");
    for (const [field, count] of [...byField.entries()].sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${field}: ${count}`);
    }
    console.log("Sample changes:");
    const sampleChanges = [
      ...new Map(
        [...bySource.keys()].flatMap((source) =>
          changes
            .filter((change) => change.row.source === source)
            .slice(0, 8)
            .map((change) => [change.row.id, change] as const)
        )
      ).values(),
    ];
    for (const change of sampleChanges) {
      console.log(
        `  ${change.row.id} [${change.row.source}]: ` +
          JSON.stringify({
            description: change.row.description,
            type: [change.row.type, change.nextType],
            action: [change.row.action, change.nextAction],
            assetType: [
              change.row.asset_type,
              change.normalized.assetType,
            ],
            symbol: [change.row.symbol, change.nextSymbol],
            securityId: [
              change.row.security_id,
              change.nextSecurityId,
            ],
            underlyingSecurityId: [
              change.row.underlying_security_id,
              change.nextUnderlyingSecurityId,
            ],
            optionId: [change.row.option_id, change.nextOptionId],
            optionAction: [
              change.row.option_action,
              change.nextOptionAction,
            ],
          })
      );
    }
  }

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

    for (const change of securityChanges) {
      await tx`
        update securities
        set
          symbol = ${change.nextSymbol},
          raw_symbol = ${change.nextRawSymbol},
          description = ${change.nextDescription},
          instrument_type_code = ${change.nextInstrumentTypeCode},
          instrument_type_description = ${change.nextInstrumentTypeDescription},
          exchange_code = ${change.nextExchangeCode},
          exchange_mic_code = ${change.nextExchangeMicCode},
          exchange_name = ${change.nextExchangeName},
          listing_status = ${change.nextListingStatus},
          delisted_at = ${change.nextDelistedAt},
          updated_at = now()
        where id = ${change.row.id}
      `;
    }

    for (const {
      row,
      normalized,
      nextAction,
      nextType,
      nextSymbol,
      nextSecurityId,
      nextUnderlyingSecurityId,
      nextOptionId,
      nextOptionAction,
    } of changes) {
      await tx`
        update transactions
        set
          type = ${nextType},
          action = ${nextAction},
          asset_type = ${normalized.assetType},
          symbol = ${nextSymbol},
          security_id = ${nextSecurityId},
          underlying_security_id = ${nextUnderlyingSecurityId},
          option_id = ${nextOptionId},
          option_action = ${nextOptionAction}
        where id = ${row.id}
      `;
    }
  });

  console.log(
    `Updated ${changes.length} transactions and ${securityChanges.length} securities.`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
