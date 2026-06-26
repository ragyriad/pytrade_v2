import {
  mapSnaptradeTransaction,
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

export type ActivityProcessingResult = {
  securitiesProcessed: number;
  transactionsProcessed: number;
  securities: Security[];
  transactions: Transaction[];
};

export type ActivityProcessorDependencies<TActivity extends SnapTradeActivityLike> = {
  upsertSecurityRows?: typeof upsertSecurities;
  upsertTransactionRows?: typeof upsertTransactions;
  mapTransaction?: (
    activity: TActivity,
    accountId: string,
    securityId?: string | null
  ) => NewTransaction;
};

export type ProcessAccountActivitiesParams<TActivity extends SnapTradeActivityLike> = {
  db: DB;
  accountId: string;
  activities: TActivity[];
  dependencies?: ActivityProcessorDependencies<TActivity>;
};

export async function processAccountActivities<
  TActivity extends SnapTradeActivityLike,
>({
  db,
  accountId,
  activities,
  dependencies = {},
}: ProcessAccountActivitiesParams<TActivity>): Promise<ActivityProcessingResult> {
  const upsertSecurityRows = dependencies.upsertSecurityRows ?? upsertSecurities;
  const upsertTransactionRows = dependencies.upsertTransactionRows ?? upsertTransactions;
  const mapTransaction =
    dependencies.mapTransaction ??
    ((activity, internalAccountId, securityId) =>
      mapSnaptradeTransaction(activity as Parameters<typeof mapSnaptradeTransaction>[0], internalAccountId, securityId));

  const securityInputs = mergeSecurityInputs(
    activities
      .map((activity) => mapSecurityFromActivity(activity))
      .filter((value): value is NonNullable<typeof value> => value !== null)
  );

  const persistedSecurities = await upsertSecurityRows(db, securityInputs);
  const securitiesByKey = new Map(
    persistedSecurities.map((security) => [security.securityKey, security])
  );

  const transactionInputs = activities.map((activity) => {
    const securityKey = activity.symbol ? buildSecurityKey(activity.symbol) : null;
    const securityId = securityKey ? securitiesByKey.get(securityKey)?.id ?? null : null;
    return mapTransaction(activity, accountId, securityId);
  });

  const persistedTransactions = await upsertTransactionRows(db, transactionInputs);

  return {
    securitiesProcessed: persistedSecurities.length,
    transactionsProcessed: persistedTransactions.length,
    securities: persistedSecurities,
    transactions: persistedTransactions,
  };
}
