import {
  archiveDuplicateSnaptradeCashTransactions,
  mapSnaptradeTransaction,
  normalizeSnaptradeCashTransactions,
  upsertOptions,
  upsertSecurities,
  upsertTransactions,
  type DB,
  type NewTransaction,
  type Security,
  type Transaction,
} from "@repo/db";
import {
  buildSecurityKey,
  mapSecurityFromActivity,
  mergeSecurityInputs,
  type SnapTradeActivityLike,
} from "./securities.js";
import {
  mapOptionFromActivity,
  mergeOptionMappings,
} from "./options.js";

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
  upsertTransactionRows?: typeof upsertTransactions;
  archiveDuplicateTransactionRows?: typeof archiveDuplicateSnaptradeCashTransactions;
  normalizeCashTransactionRows?: typeof normalizeSnaptradeCashTransactions;
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

function normalizeNumber(value: string | number | null | undefined): string {
  if (value == null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  if (Object.is(parsed, -0) || parsed === 0) return "0";
  return parsed.toString();
}

function normalizeDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
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

function cashActivityFingerprint(activity: SnapTradeActivityLike): string {
  return [
    normalizeDate(activity.trade_date),
    normalizeDate(activity.settlement_date),
    normalizeText(activity.external_reference_id),
    normalizeText(activity.type),
    normalizeText(activity.description),
    normalizeNumber(activity.amount),
    normalizeText(activity.currency?.code),
    normalizeText(activity.symbol?.id ?? activity.symbol?.symbol),
    normalizeNumber(activity.units),
    normalizeNumber(activity.price),
    normalizeNumber(activity.fee),
  ].join("|");
}

export function dedupeWealthsimpleCashActivities<
  TActivity extends SnapTradeActivityLike,
>(
  accountType: string | null | undefined,
  activities: TActivity[],
  providerName?: string | null
): { activities: TActivity[]; skipped: number; enabled: boolean } {
  const enabled = isWealthsimpleCashLikeAccount(
    accountType,
    activities,
    providerName
  );
  if (!enabled) return { activities, skipped: 0, enabled: false };

  const byFingerprint = new Map<string, TActivity>();
  for (const activity of activities) {
    const fingerprint = cashActivityFingerprint(activity);
    const current = byFingerprint.get(fingerprint);
    const currentId = current?.id ?? "";
    const candidateId = activity.id ?? "";

    if (!current || (candidateId && (!currentId || candidateId < currentId))) {
      byFingerprint.set(fingerprint, activity);
    }
  }

  return {
    activities: [...byFingerprint.values()],
    skipped: activities.length - byFingerprint.size,
    enabled: true,
  };
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
  const upsertTransactionRows = dependencies.upsertTransactionRows ?? upsertTransactions;
  const archiveDuplicateTransactionRows =
    dependencies.archiveDuplicateTransactionRows ??
    archiveDuplicateSnaptradeCashTransactions;
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
  const deduped = dedupeWealthsimpleCashActivities(
    accountType,
    activities,
    providerName
  );
  const activitiesToProcess = deduped.activities;
  const optionMappingsByActivity = activitiesToProcess.map((activity) =>
    mapOptionFromActivity(activity)
  );
  const optionMappings = mergeOptionMappings(
    optionMappingsByActivity.filter(
      (value): value is NonNullable<typeof value> => value !== null
    )
  );

  const securityInputs = mergeSecurityInputs(
    [
      ...activitiesToProcess
        .map((activity) => mapSecurityFromActivity(activity))
        .filter((value): value is NonNullable<typeof value> => value !== null),
      ...optionMappings.flatMap((mapping) => [
        mapping.underlyingSecurity,
        mapping.contractSecurity,
      ]),
    ]
  );

  const persistedSecurities = await upsertSecurityRows(db, securityInputs);
  const securitiesByKey = new Map(
    persistedSecurities.map((security) => [security.securityKey, security])
  );
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

    const securityKey = activity.symbol ? buildSecurityKey(activity.symbol) : null;
    const securityId = securityKey ? securitiesByKey.get(securityKey)?.id ?? null : null;
    return mapTransaction(activity, accountId, securityId, {
      accountType,
      underlyingSecurityId: securityId,
    });
  });

  const persistedTransactions = await upsertTransactionRows(db, transactionInputs);
  const cashTransactionsNormalized = deduped.enabled
    ? await normalizeCashTransactionRows(db, accountId)
    : 0;
  const duplicateTransactionsArchived = deduped.enabled
    ? await archiveDuplicateTransactionRows(db, accountId)
    : 0;

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
