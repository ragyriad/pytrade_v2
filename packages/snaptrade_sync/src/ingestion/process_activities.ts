import {
  archiveTransactionsByIds,
  getTransactionsByAccount,
  securities as securitiesTable,
  upsertOptions,
  upsertSecurities,
  upsertSecurityAliases,
  upsertTransactions,
  type DB,
  type NewTransaction,
  type NewSecurityAlias,
  type Security,
  type Transaction,
} from "@repo/db";
import {
  deduplicateSnaptradeCashActivities,
  planExactProviderDuplicateArchives,
} from "@repo/data-deduplicator";
import {
  normalizeTransaction,
  normalizeSecurityType,
  resolveSecurityCandidate,
  type SecurityResolutionCandidate,
} from "@repo/data-normalizer";
import {
  buildSecurityKey,
  mapSecurityFromActivity,
  mapRecoveredSecurityFromActivity,
  mergeSecurityInputs,
  prepareSecurityInputs,
  type SnapTradeActivityLike,
} from "./securities.js";
import {
  mapOptionFromActivity,
  mergeOptionMappings,
} from "./options.js";
import { mapSnaptradeTransaction } from "./transaction_mapper.js";
import { normalizeSnaptradeCashTransactions } from "./cash_reconciliation.js";

export type ActivityProcessingResult = {
  securitiesProcessed: number;
  transactionsProcessed: number;
  duplicateActivitiesSkipped: number;
  cashTransactionsNormalized: number;
  duplicateTransactionsArchived: number;
  securities: Security[];
  transactions: Transaction[];
};

export type ActivityProcessorDependencies<TActivity extends SnapTradeActivityLike> = {
  upsertSecurityRows?: typeof upsertSecurities;
  upsertOptionRows?: typeof upsertOptions;
  upsertSecurityAliasRows?: typeof upsertSecurityAliases;
  upsertTransactionRows?: typeof upsertTransactions;
  archiveTransactionRows?: typeof archiveTransactionsByIds;
  getStoredTransactionRows?: typeof getTransactionsByAccount;
  normalizeCashTransactionRows?: typeof normalizeSnaptradeCashTransactions;
  getSecurityCandidates?: (
    db: DB
  ) => Promise<
    Array<
      SecurityResolutionCandidate & {
        securityKey: string;
        instrumentTypeCode?: string | null;
        instrumentTypeDescription?: string | null;
      }
    >
  >;
  mapTransaction?: (
    activity: TActivity,
    accountId: string,
    securityId?: string | null,
    options?: {
      accountType?: string | null;
      underlyingSecurityId?: string | null;
      optionId?: string | null;
      optionAction?: string | null;
      symbolOverride?: string | null;
      descriptionOverride?: string | null;
      assetTypeOverride?: string | null;
    }
  ) => NewTransaction;
};

export type ProcessAccountActivitiesParams<TActivity extends SnapTradeActivityLike> = {
  db: DB;
  accountId: string;
  accountType?: string | null;
  providerName?: string | null;
  activities: TActivity[];
  dependencies?: ActivityProcessorDependencies<TActivity>;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function isSecurityBearingActivity(
  activity: SnapTradeActivityLike,
  accountType: string | null | undefined
): boolean {
  const normalized = normalizeTransaction(
    {
      type: activity.type,
      description: activity.description,
      symbol: activity.symbol?.symbol,
      amount: activity.amount,
      units: activity.units,
    },
    activity.symbol
      ? {
          symbol: activity.symbol.symbol,
          rawSymbol: activity.symbol.raw_symbol,
          description: activity.symbol.description,
          instrumentTypeCode: activity.symbol.type?.code,
          instrumentTypeDescription: activity.symbol.type?.description,
        }
      : null,
    { accountType }
  );
  return normalized.assetType !== "CASH" && normalized.assetType !== "INTEREST";
}

function isWealthsimpleCashLikeAccount(
  accountType: string | null | undefined,
  activities: SnapTradeActivityLike[],
  providerName?: string | null
): boolean {
  const normalizedAccountType = normalizeText(accountType);
  const isCashLike =
    normalizedAccountType === "CASH" ||
    normalizedAccountType === "CASH_CAD" ||
    normalizedAccountType === "CASH_USD" ||
    normalizedAccountType === "CREDIT_CARD";

  return (
    isCashLike &&
    (
      normalizeText(providerName).includes("WEALTHSIMPLE") ||
      activities.some((activity) =>
        normalizeText(activity.institution).includes("WEALTHSIMPLE")
      )
    )
  );
}

export async function processAccountActivities<
  TActivity extends SnapTradeActivityLike,
>({
  db,
  accountId,
  accountType,
  providerName,
  activities,
  dependencies = {},
}: ProcessAccountActivitiesParams<TActivity>): Promise<ActivityProcessingResult> {
  const upsertSecurityRows = dependencies.upsertSecurityRows ?? upsertSecurities;
  const upsertOptionRows = dependencies.upsertOptionRows ?? upsertOptions;
  const upsertSecurityAliasRows =
    dependencies.upsertSecurityAliasRows ?? upsertSecurityAliases;
  const upsertTransactionRows = dependencies.upsertTransactionRows ?? upsertTransactions;
  const archiveTransactionRows =
    dependencies.archiveTransactionRows ?? archiveTransactionsByIds;
  const getStoredTransactionRows =
    dependencies.getStoredTransactionRows ?? getTransactionsByAccount;
  const normalizeCashTransactionRows =
    dependencies.normalizeCashTransactionRows ??
    normalizeSnaptradeCashTransactions;
  const mapTransaction =
    dependencies.mapTransaction ??
    ((activity, internalAccountId, securityId, transactionOptions) =>
      mapSnaptradeTransaction(
        activity as Parameters<typeof mapSnaptradeTransaction>[0],
        internalAccountId,
        securityId,
        { accountType, ...transactionOptions }
      ));
  const getSecurityCandidates =
    dependencies.getSecurityCandidates ??
    (async (database: DB) =>
      database
        .select({
          id: securitiesTable.id,
          securityKey: securitiesTable.securityKey,
          source: securitiesTable.source,
          symbol: securitiesTable.symbol,
          rawSymbol: securitiesTable.rawSymbol,
          description: securitiesTable.description,
          currencyCode: securitiesTable.currencyCode,
          isArchived: securitiesTable.isArchived,
          snaptradeSymbolId: securitiesTable.snaptradeSymbolId,
          figiCode: securitiesTable.figiCode,
          instrumentTypeCode: securitiesTable.instrumentTypeCode,
          instrumentTypeDescription: securitiesTable.instrumentTypeDescription,
        })
        .from(securitiesTable));
  const deduplicationEnabled = isWealthsimpleCashLikeAccount(
    accountType,
    activities,
    providerName
  );
  const deduped = deduplicationEnabled
    ? deduplicateSnaptradeCashActivities(activities)
    : { activities, skipped: 0 };
  const activitiesToProcess = deduped.activities;
  const securityBearingByActivity = activitiesToProcess.map((activity) =>
    isSecurityBearingActivity(activity, accountType)
  );
  const existingSecurityCandidates = await getSecurityCandidates(db);
  const optionMappingsByActivity = activitiesToProcess.map((activity, index) =>
    securityBearingByActivity[index] ? mapOptionFromActivity(activity) : null
  );
  const optionMappings = mergeOptionMappings(
    optionMappingsByActivity.filter(
      (value): value is NonNullable<typeof value> => value !== null
    )
  );
  const recoveredSecurityMappings = activitiesToProcess.map((activity, index) =>
    securityBearingByActivity[index]
      ? mapRecoveredSecurityFromActivity(activity)
      : null
  );

  const securityInputs = mergeSecurityInputs(
    [
      ...activitiesToProcess
        .map((activity, index) =>
          securityBearingByActivity[index]
            ? mapSecurityFromActivity(activity)
            : null
        )
        .filter((value): value is NonNullable<typeof value> => value !== null),
      ...recoveredSecurityMappings.filter(
        (value): value is NonNullable<typeof value> => value !== null
      ),
      ...optionMappings.flatMap((mapping) => [
        mapping.underlyingSecurity,
        mapping.contractSecurity,
      ]),
    ]
  );

  const preparedSecurityInputs = prepareSecurityInputs(
    securityInputs,
    existingSecurityCandidates
  );
  const persistedSecurities = await upsertSecurityRows(
    db,
    preparedSecurityInputs.inputs
  );
  const securitiesByKey = new Map(
    persistedSecurities.map((security) => [security.securityKey, security])
  );
  for (const [inputKey, storageKey] of preparedSecurityInputs.storageKeyByInputKey) {
    const security = securitiesByKey.get(storageKey);
    if (security) securitiesByKey.set(inputKey, security);
  }
  const securityCandidates = [
    ...existingSecurityCandidates,
    ...persistedSecurities,
  ];
  const aliasInputs = activitiesToProcess
    .map((activity, index): NewSecurityAlias | null => {
      if (!securityBearingByActivity[index] || !activity.symbol) return null;
      const key = buildSecurityKey(activity.symbol);
      const security = key ? securitiesByKey.get(key) : null;
      const rawSymbol =
        activity.symbol.raw_symbol?.trim() ||
        activity.symbol.symbol?.trim() ||
        null;
      if (!security || !rawSymbol) return null;
      const currencyCode =
        activity.symbol.currency?.code ?? activity.currency?.code ?? null;
      return {
        securityId: security.id,
        source: "SNAPTRADE",
        externalId:
          activity.symbol.id?.trim() ||
          `${rawSymbol.toUpperCase()}|${currencyCode?.toUpperCase() ?? ""}`,
        symbol: rawSymbol,
        rawSymbol,
        currencyCode,
        exchangeCode: activity.symbol.exchange?.code ?? null,
        exchangeMicCode: activity.symbol.exchange?.mic_code ?? null,
        isArchived: false,
      };
    })
    .filter((value): value is NewSecurityAlias => value !== null);
  const uniqueAliasInputs = [
    ...new Map(
      aliasInputs.map((alias) => [
        `${alias.source}|${alias.externalId}`,
        alias,
      ])
    ).values(),
  ];
  await upsertSecurityAliasRows(db, uniqueAliasInputs);
  const optionInputs = optionMappings
    .map((mapping) => {
      const contractSecurity = securitiesByKey.get(mapping.contractSecurity.securityKey);
      const underlyingSecurity = securitiesByKey.get(mapping.underlyingSecurity.securityKey);
      if (!contractSecurity || !underlyingSecurity) return null;

      return {
        ...mapping.option,
        securityId: contractSecurity.id,
        underlyingSecurityId: underlyingSecurity.id,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const persistedOptions = await upsertOptionRows(db, optionInputs);
  const optionsByTicker = new Map(
    persistedOptions.map((option) => [option.ticker, option])
  );

  const transactionInputs = activitiesToProcess.map((activity, index) => {
    if (!securityBearingByActivity[index]) {
      return mapTransaction(activity, accountId, null, {
        accountType,
        underlyingSecurityId: null,
        optionId: null,
        optionAction: null,
        symbolOverride: null,
        assetTypeOverride: null,
      });
    }
    const optionMapping = optionMappingsByActivity[index];
    if (optionMapping) {
      const contractSecurity = securitiesByKey.get(optionMapping.contractSecurity.securityKey);
      const underlyingSecurity = securitiesByKey.get(optionMapping.underlyingSecurity.securityKey);
      const option = optionsByTicker.get(optionMapping.ticker);

      return mapTransaction(activity, accountId, underlyingSecurity?.id ?? contractSecurity?.id ?? null, {
        accountType,
        underlyingSecurityId: underlyingSecurity?.id ?? null,
        optionId: option?.id ?? null,
        optionAction: optionMapping.optionAction,
        symbolOverride: underlyingSecurity?.symbol ?? optionMapping.underlyingSecurity.symbol,
        descriptionOverride: optionMapping.description,
        assetTypeOverride: "OPTION",
      });
    }

    const directSecurityKey = activity.symbol
      ? buildSecurityKey(activity.symbol)
      : recoveredSecurityMappings[index]?.securityKey ?? null;
    const directSecurity = directSecurityKey
      ? securitiesByKey.get(directSecurityKey) ?? null
      : null;
    const resolvedSecurity =
      directSecurity ??
      resolveSecurityCandidate(
        {
          symbol: activity.symbol?.symbol,
          description: activity.description,
          currencyCode: activity.currency?.code,
          rawData: activity,
        },
        securityCandidates
      );
    const securityType = resolvedSecurity
      ? normalizeSecurityType({
          code: resolvedSecurity.instrumentTypeCode,
          description: [
            resolvedSecurity.description,
            resolvedSecurity.instrumentTypeDescription,
          ]
            .filter(Boolean)
            .join(" "),
          symbol: resolvedSecurity.symbol,
        })
      : null;
    return mapTransaction(activity, accountId, resolvedSecurity?.id ?? null, {
      accountType,
      underlyingSecurityId: resolvedSecurity?.id ?? null,
      symbolOverride: resolvedSecurity?.symbol ?? null,
      assetTypeOverride:
        securityType === "SECURITY" &&
        ["BUY", "SELL"].includes(normalizeText(activity.type))
          ? "STOCK"
          : securityType,
    });
  });

  const persistedTransactions = await upsertTransactionRows(db, transactionInputs);
  const cashTransactionsNormalized = deduplicationEnabled
    ? await normalizeCashTransactionRows(db, accountId)
    : 0;
  let duplicateTransactionsArchived = 0;
  if (deduplicationEnabled) {
    const storedRows = await getStoredTransactionRows(db, accountId);
    const duplicateIds = planExactProviderDuplicateArchives(
      storedRows
        .filter((transaction) => transaction.snaptradeTransactionId)
        .map((transaction) => ({
          ...transaction,
          settlementDate:
            typeof transaction.rawData?.settlement_date === "string"
              ? transaction.rawData.settlement_date
              : null,
        }))
    );
    duplicateTransactionsArchived = await archiveTransactionRows(
      db,
      duplicateIds
    );
  }

  return {
    securitiesProcessed: persistedSecurities.length,
    transactionsProcessed: persistedTransactions.length,
    duplicateActivitiesSkipped: deduped.skipped,
    cashTransactionsNormalized,
    duplicateTransactionsArchived,
    securities: persistedSecurities,
    transactions: persistedTransactions,
  };
}
