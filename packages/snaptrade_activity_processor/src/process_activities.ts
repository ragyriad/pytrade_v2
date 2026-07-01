import {
  mapSnaptradeTransaction,
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
  securities: Security[];
  transactions: Transaction[];
};

export type ActivityProcessorDependencies<TActivity extends SnapTradeActivityLike> = {
  upsertSecurityRows?: typeof upsertSecurities;
  upsertOptionRows?: typeof upsertOptions;
  upsertTransactionRows?: typeof upsertTransactions;
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
  activities: TActivity[];
  dependencies?: ActivityProcessorDependencies<TActivity>;
};

export async function processAccountActivities<
  TActivity extends SnapTradeActivityLike,
>({
  db,
  accountId,
  accountType,
  activities,
  dependencies = {},
}: ProcessAccountActivitiesParams<TActivity>): Promise<ActivityProcessingResult> {
  const upsertSecurityRows = dependencies.upsertSecurityRows ?? upsertSecurities;
  const upsertOptionRows = dependencies.upsertOptionRows ?? upsertOptions;
  const upsertTransactionRows = dependencies.upsertTransactionRows ?? upsertTransactions;
  const mapTransaction =
    dependencies.mapTransaction ??
    ((activity, internalAccountId, securityId, transactionOptions) =>
      mapSnaptradeTransaction(
        activity as Parameters<typeof mapSnaptradeTransaction>[0],
        internalAccountId,
        securityId,
        { accountType, ...transactionOptions }
      ));
  const optionMappingsByActivity = activities.map((activity) =>
    mapOptionFromActivity(activity)
  );
  const optionMappings = mergeOptionMappings(
    optionMappingsByActivity.filter(
      (value): value is NonNullable<typeof value> => value !== null
    )
  );

  const securityInputs = mergeSecurityInputs(
    [
      ...activities
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

  const transactionInputs = activities.map((activity, index) => {
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

  return {
    securitiesProcessed: persistedSecurities.length,
    transactionsProcessed: persistedTransactions.length,
    securities: persistedSecurities,
    transactions: persistedTransactions,
  };
}
