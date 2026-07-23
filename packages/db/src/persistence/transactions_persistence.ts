import { and, eq, isNotNull, sql } from "drizzle-orm";
import { DB } from "../db_type.js";
import { transactions, Transaction, NewTransaction } from "../schemas/transactions_schema.js";

/**
 * Upserts a single transaction row, keyed on snaptradeTransactionId.
 * Safe to call repeatedly during sync — idempotent.
 *
 * @example
 * await upsertTransaction(db, mappedTransaction);
 */
export async function upsertTransaction(
  db: DB,
  data: NewTransaction
): Promise<void> {
  await db
    .insert(transactions)
    .values(data)
    .onConflictDoUpdate({
      target: [transactions.snaptradeTransactionId],
      set: {
        type: data.type,
        action: data.action,
        assetType: data.assetType,
        description: data.description,
        source: data.source,
        externalTransactionId: data.externalTransactionId,
        legacyImportKey: data.legacyImportKey,
        isArchived: data.isArchived ?? false,
        securityId: data.securityId,
        underlyingSecurityId: data.underlyingSecurityId,
        optionId: data.optionId,
        optionAction: data.optionAction,
        amount: data.amount,
        price: data.price,
        units: data.units,
        fee: data.fee,
        currencyCode: data.currencyCode,
        symbol: data.symbol,
        tradeDate: data.tradeDate,
        rawData: data.rawData,
      },
    });
}

/**
 * Bulk-upserts multiple transactions in a single statement.
 * Preferred over calling upsertTransaction in a loop during sync.
 *
 * @example
 * await upsertTransactions(db, mappedTransactions);
 */
// export async function upsertTransactions(
//   db: DB,
//   data: NewTransaction[]
// ): Promise<Transaction> {
//   if (data.length === 0) return;

//   await db
//     .insert(transactions)
//     .values(data)
//     .onConflictDoUpdate({
//       target: [transactions.snaptradeTransactionId],
//       set: {
//         type: sql`excluded.type`,
//         description: sql`excluded.description`,
//         amount: sql`excluded.amount`,
//         price: sql`excluded.price`,
//         units: sql`excluded.units`,
//         fee: sql`excluded.fee`,
//         currencyCode: sql`excluded.currency_code`,
//         symbol: sql`excluded.symbol`,
//         tradeDate: sql`excluded.trade_date`,
//       },
//     });
// }

export async function upsertTransactions(
  db: DB,
  data: NewTransaction[]
): Promise<Transaction[]> {          
  if (data.length === 0) return [];
  return db                          
    .insert(transactions)
    .values(data)
    .onConflictDoUpdate({
      target: [transactions.snaptradeTransactionId],
      set: {
        type: sql`excluded.type`,
        action: sql`excluded.action`,
        assetType: sql`excluded.asset_type`,
        description: sql`excluded.description`,
        source: sql`excluded.source`,
        externalTransactionId: sql`excluded.external_transaction_id`,
        legacyImportKey: sql`excluded.legacy_import_key`,
        isArchived: sql`${transactions.isArchived} and excluded.is_archived`,
        securityId: sql`excluded.security_id`,
        underlyingSecurityId: sql`excluded.underlying_security_id`,
        optionId: sql`excluded.option_id`,
        optionAction: sql`excluded.option_action`,
        amount: sql`excluded.amount`,
        price: sql`excluded.price`,
        units: sql`excluded.units`,
        fee: sql`excluded.fee`,
        currencyCode: sql`excluded.currency_code`,
        symbol: sql`excluded.symbol`,
        tradeDate: sql`excluded.trade_date`,
        rawData: sql`excluded.raw_data`,
      },
    })
    .returning();  
}

/**
 * Inserts a new transaction row.
 * Throws if snaptradeTransactionId already exists — use upsertTransaction for syncs.
 *
 * @example
 * const tx = await createTransaction(db, mappedTransaction);
 */
export async function createTransaction(
  db: DB,
  data: NewTransaction
): Promise<Transaction> {
  const rows = await db.insert(transactions).values(data).returning();
  return rows[0];
}

/**
 * Returns all transactions for a given account, ordered by trade date descending.
 *
 * @example
 * const txs = await getTransactionsByAccount(db, accountId);
 */
export async function getTransactionsByAccount(
  db: DB,
  accountId: string,
  options: { includeArchived?: boolean } = {}
): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(
      options.includeArchived
        ? eq(transactions.accountId, accountId)
        : and(eq(transactions.accountId, accountId), eq(transactions.isArchived, false))
    )
    .orderBy(sql`${transactions.tradeDate} desc`);
}

/**
 * Returns the newest SnapTrade activity date stored for an account. Imported
 * statement rows are deliberately excluded from this sync watermark.
 */
export async function getLatestSnaptradeTransactionDate(
  db: DB,
  accountId: string
): Promise<Date | null> {
  const rows = await db
    .select({
      latestTradeDate: sql<Date | null>`max(${transactions.tradeDate})`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.isArchived, false),
        sql`${transactions.snaptradeTransactionId} is not null`
      )
    );
  const value = rows[0]?.latestTradeDate;
  if (!value) return null;

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Deletes all transactions for a given account.
 * Used when an account is being fully re-synced from scratch.
 *
 * @example
 * await deleteTransactionsByAccount(db, accountId);
 */
export async function deleteTransactionsByAccount(
  db: DB,
  accountId: string
): Promise<void> {
  await db
    .delete(transactions)
    .where(eq(transactions.accountId, accountId));
}

/**
 * Deletes only provider-owned SnapTrade activity rows for an account.
 * Statement and legacy imports have no SnapTrade transaction id and are kept.
 */
export async function deleteSnaptradeTransactionsByAccount(
  db: DB,
  accountId: string
): Promise<number> {
  const deleted = await db
    .delete(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        isNotNull(transactions.snaptradeTransactionId)
      )
    )
    .returning({ id: transactions.id });

  return deleted.length;
}

/**
 * Archives exact provider duplicates for a cash-like account. SnapTrade can
 * occasionally return the same Wealthsimple activity under multiple UUIDs.
 * The signed amount is part of the partition, so reversals remain separate.
 */
export async function archiveDuplicateSnaptradeCashTransactions(
  db: DB,
  accountId: string
): Promise<number> {
  const archived = await db.execute(sql`
    with ranked as (
      select
        ${transactions.id} as id,
        row_number() over (
          partition by
            ${transactions.accountId},
            ${transactions.tradeDate},
            ${transactions.amount},
            coalesce(${transactions.currencyCode}, ''),
            coalesce(${transactions.rawData} ->> 'type', ${transactions.action}, ${transactions.type}),
            coalesce(${transactions.rawData} ->> 'settlement_date', ''),
            coalesce(
              ${transactions.externalTransactionId},
              ${transactions.rawData} ->> 'external_reference_id',
              ''
            ),
            coalesce(${transactions.description}, ''),
            coalesce(${transactions.symbol}, ''),
            coalesce(${transactions.units}, 0),
            coalesce(${transactions.price}, 0),
            ${transactions.fee}
          order by ${transactions.createdAt}, ${transactions.id}
        ) as duplicate_rank
      from ${transactions}
      where ${transactions.accountId} = ${accountId}
        and ${transactions.isArchived} = false
        and ${transactions.snaptradeTransactionId} is not null
    )
    update ${transactions} as duplicate
    set "is_archived" = true
    from ranked
    where duplicate.id = ranked.id
      and ranked.duplicate_rank > 1
    returning duplicate.id
  `);

  return archived.length;
}

/**
 * Normalizes existing SnapTrade rows when an account is known to be cash-like.
 * This repairs historical Wealthsimple rows without requiring replacement mode.
 */
export async function normalizeSnaptradeCashTransactions(
  db: DB,
  accountId: string
): Promise<number> {
  const normalized = await db.execute(sql`
    with classified as (
      select
        ${transactions.id} as id,
        case
          when upper(replace(
            coalesce(
              ${transactions.rawData} ->> 'type',
              ${transactions.action},
              ${transactions.type}
            ),
            '_',
            ' '
          )) = 'CREDIT CARD'
            then 'SPEND'
          when upper(replace(
            coalesce(
              ${transactions.rawData} ->> 'type',
              ${transactions.action},
              ${transactions.type}
            ),
            '_',
            ' '
          )) = 'CREDIT CARD PAYMENT'
            then 'CREDIT_CARD_PAYMENT'
          when upper(replace(
            coalesce(
              ${transactions.rawData} ->> 'type',
              ${transactions.action},
              ${transactions.type}
            ),
            '_',
            ' '
          )) = 'P2P PAYMENT'
            then 'P2P_PAYMENT'
          when upper(coalesce(
            ${transactions.rawData} ->> 'type',
            ${transactions.action},
            ${transactions.type}
          )) = 'CONTRIBUTION'
            then 'DEPOSIT'
          when upper(coalesce(
            ${transactions.rawData} ->> 'type',
            ${transactions.action},
            ${transactions.type}
          )) = 'REFUND'
            then 'REIMBURSEMENT'
          else coalesce(
            ${transactions.action},
            ${transactions.rawData} ->> 'type',
            ${transactions.type}
          )
        end as normalized_action
      from ${transactions}
      where ${transactions.accountId} = ${accountId}
        and ${transactions.snaptradeTransactionId} is not null
    )
    update ${transactions} as target
    set
      "type" = 'CASH',
      "action" = classified.normalized_action,
      "asset_type" = 'CASH'
    from classified
    where target.id = classified.id
      and (
        target.type is distinct from 'CASH'
        or target.action is distinct from classified.normalized_action
        or target.asset_type is distinct from 'CASH'
      )
    returning target.id
  `);

  return normalized.length;
}
