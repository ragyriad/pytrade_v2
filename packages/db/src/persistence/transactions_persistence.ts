import { eq, sql } from "drizzle-orm";
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
        securityId: data.securityId,
        amount: data.amount,
        price: data.price,
        units: data.units,
        fee: data.fee,
        currencyCode: data.currencyCode,
        symbol: data.symbol,
        tradeDate: data.tradeDate,
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
        securityId: sql`excluded.security_id`,
        amount: sql`excluded.amount`,
        price: sql`excluded.price`,
        units: sql`excluded.units`,
        fee: sql`excluded.fee`,
        currencyCode: sql`excluded.currency_code`,
        symbol: sql`excluded.symbol`,
        tradeDate: sql`excluded.trade_date`,
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
  accountId: string
): Promise<Transaction[]> {
  return db
    .select()
    .from(transactions)
    .where(eq(transactions.accountId, accountId))
    .orderBy(sql`${transactions.tradeDate} desc`);
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
