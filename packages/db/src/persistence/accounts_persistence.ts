import { eq, sql, and, inArray } from "drizzle-orm";
import { DB } from "../db_type.js";
import { accounts, Account, NewAccount, AccountSummary } from "../schemas/accounts_schema.js";

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Upserts an account row, keyed on brokerageAccountNumber.
 * Safe to call repeatedly during sync — idempotent.
 */
export async function upsertAccount(
  db: DB,
  data: NewAccount
): Promise<void> {
  await db
    .insert(accounts)
    .values(data)
    .onConflictDoUpdate({
      target: [accounts.brokerageAccountNumber],
      set: {
        snaptradeAccountId: data.snaptradeAccountId,
        brokerageAuthorization: data.brokerageAuthorization,
        brokerageAccountNumber: data.brokerageAccountNumber,
        brokerageName: data.brokerageName,
        accountCurrency: data.accountCurrency,
        type: data.type,
        name: data.name,
        balanceAmount: data.balanceAmount,
        balanceCurrency: data.balanceCurrency,
        linkedAccountId: data.linkedAccountId,
        status: data.status,
        lastTransactionsSyncAt: data.lastTransactionsSyncAt,
        firstTransactionDate: data.firstTransactionDate,
        lastHoldingsSyncAt: data.lastHoldingsSyncAt,
        updatedAt: sql`now()`,
      },
    });
}

/**
 * Inserts a new account row.
 * Throws if brokerageAccountNumber already exists — use upsertAccount for syncs.
 */
export async function createAccount(db: DB, data: NewAccount): Promise<Account> {
  const rows = await db.insert(accounts).values(data).returning();
  return rows[0];
}

/**
 * Updates only the balance fields on an account.
 * Lighter alternative to a full upsert when only balance has changed.
 */
export async function updateAccountBalance(
  db: DB,
  id: string,
  balanceAmount: string,
  balanceCurrency: string
): Promise<void> {
  await db
    .update(accounts)
    .set({ balanceAmount, balanceCurrency, updatedAt: sql`now()` })
    .where(eq(accounts.id, id));
}

export async function updateAccountSyncTimestamp(
  db: DB,
  id: string
): Promise<void> {
  await db
    .update(accounts)
    .set({ lastTransactionsSyncAt: new Date(), updatedAt: sql`now()` })
    .where(eq(accounts.id, id));
}

/**
 * Marks an account's sync timestamps after a successful sync run.
 * Called by the sync worker at the end of each job, not by the API.
 */
export async function markAccountSynced(
  db: DB,
  id: string,
  options: { holdings?: boolean; transactions?: boolean }
): Promise<void> {
  const now = new Date();
  await db
    .update(accounts)
    .set({
      ...(options.holdings && {
        syncHoldingsCompleted: true,
        syncHoldingsLastAt: now,
      }),
      ...(options.transactions && {
        syncTransactionsCompleted: true,
        syncTransactionsLastAt: now,
      }),
      updatedAt: sql`now()`,
    })
    .where(eq(accounts.id, id));
}

/**
 * Soft-deletes an account by setting status to "inactive".
 * We never hard-delete accounts — transactions reference them.
 */
export async function deactivateAccount(db: DB, id: string): Promise<void> {
  await db
    .update(accounts)
    .set({ status: "inactive", updatedAt: sql`now()` })
    .where(eq(accounts.id, id));
}

// ---------------------------------------------------------------------------
// Single row reads
// ---------------------------------------------------------------------------

/**
 * Fetch a single account by internal DB id.
 * Use this when you already have the internal UUID (e.g. from a FK resolution).
 *
 * @example
 * const account = await getAccountById(db, id);
 */
export async function getAccountById(
  db: DB,
  id: string
): Promise<Account | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch a single account by SnapTrade's external UUID.
 * Used after a sync to resolve the internal FK from a SnapTrade API response.
 *
 * @example
 * const account = await getAccountBySnaptradeId(db, snaptradeAccountId);
 */
export async function getAccountBySnaptradeId(
  db: DB,
  snaptradeAccountId: string
): Promise<Account | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.snaptradeAccountId, snaptradeAccountId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Fetch a single account by brokerage account number (e.g. "TFSA-12345").
 * This is the stable natural key used as the upsert target.
 *
 * @example
 * const account = await getAccountByBrokerageNumber(db, "TFSA-12345");
 */
export async function getAccountByBrokerageNumber(
  db: DB,
  brokerageAccountNumber: string
): Promise<Account | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.brokerageAccountNumber, brokerageAccountNumber))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Collection reads
// ---------------------------------------------------------------------------

/**
 * Fetch all accounts belonging to a user.
 * Primary query for the API layer — returns full account rows.
 *
 * @example
 * const accounts = await getAccountsByUserId(db, userId);
 */
export async function getAccountsByUserId(
  db: DB,
  userId: string
): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
}

/**
 * Fetch lightweight account summaries for a user.
 * Use for list views — avoids pulling sync fields and internal timestamps.
 *
 * @example
 * const summaries = await getAccountSummariesByUserId(db, userId);
 */
export async function getAccountSummariesByUserId(
  db: DB,
  userId: string
): Promise<AccountSummary[]> {
  return db
    .select({
      id: accounts.id,
      userId: accounts.userId,
      status: accounts.status,
      brokerageAccountNumber: accounts.brokerageAccountNumber,
      name: accounts.name,
      type: accounts.type,
      balanceAmount: accounts.balanceAmount,
      balanceCurrency: accounts.balanceCurrency,
      firstTransactionDate: accounts.firstTransactionDate,
    })
    .from(accounts)
    .where(eq(accounts.userId, userId));
}

/**
 * Fetch all active accounts for a user.
 * Excludes inactive/deactivated/closed accounts.
 *
 * @example
 * const active = await getActiveAccountsByUserId(db, userId);
 */
export async function getActiveAccountsByUserId(
  db: DB,
  userId: string
): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.status, "active")
      )
    );
}

/**
 * Fetch all accounts at a specific brokerage for a user.
 * Useful when a user has multiple accounts at the same institution.
 *
 * @example
 * const wsAccounts = await getAccountsByBrokerage(db, userId, "Wealthsimple");
 */
export async function getAccountsByBrokerage(
  db: DB,
  userId: string,
  brokerageName: string
): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.brokerageName, brokerageName)
      )
    );
}

/**
 * Fetch multiple accounts by their internal IDs in a single query.
 * Useful when you have a list of account IDs from another query.
 *
 * @example
 * const accounts = await getAccountsByIds(db, [id1, id2, id3]);
 */
export async function getAccountsByIds(
  db: DB,
  ids: string[]
): Promise<Account[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(accounts)
    .where(inArray(accounts.id, ids));
}

/**
 * Fetch all accounts that have never had a transaction sync.
 * Used by the sync worker to prioritise accounts for a first sync.
 *
 * @example
 * const unsynced = await getUnsyncedAccounts(db, userId);
 */
export async function getUnsyncedAccounts(
  db: DB,
  userId: string
): Promise<Account[]> {
  return db
    .select()
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        sql`${accounts.lastTransactionsSyncAt} IS NULL`
      )
    );
}