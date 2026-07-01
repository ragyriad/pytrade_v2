import { eq, inArray, sql, and } from "drizzle-orm";
import { DB } from "../db_type.js";
import { positions, Position, NewPosition } from "../schemas/positions_schema.js";
 
// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
 
/**
 * Replaces all positions for an account in a single transaction.
 *
 * This is the correct sync strategy for positions — they are a point-in-time
 * snapshot, not an append log. A sold position simply disappears from the next
 * API response. Delete-and-reinsert inside a transaction guarantees no stale
 * rows remain after a sell, and is atomic so readers never see a half-written
 * state.
 *
 * Always prefer this over upsertPositions during a full sync run.
 *
 * @example
 * await replaceAccountPositions(db, accountId, mappedPositions);
 */
export async function replaceAccountPositions(
  db: DB,
  accountId: string,
  data: NewPosition[]
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(positions).where(eq(positions.accountId, accountId));
    if (data.length > 0) {
      await tx.insert(positions).values(data);
    }
  });
}
 
/**
 * Upserts positions keyed on (accountId, symbol).
 * Use only for partial single-position refreshes.
 * For full syncs always use replaceAccountPositions.
 *
 * @example
 * await upsertPositions(db, mappedPositions);
 */
export async function upsertPositions(
  db: DB,
  data: NewPosition[]
): Promise<void> {
  if (data.length === 0) return;
 
  await db
    .insert(positions)
    .values(data)
    .onConflictDoUpdate({
      target: [positions.accountId, positions.symbol],
      set: {
        units: sql`excluded.units`,
        securityId: sql`excluded.security_id`,
        fractionalUnits: sql`excluded.fractional_units`,
        price: sql`excluded.price`,
        averagePurchasePrice: sql`excluded.average_purchase_price`,
        openPnl: sql`excluded.open_pnl`,
        currencyCode: sql`excluded.currency_code`,
        cashEquivalent: sql`excluded.cash_equivalent`,
        isQuotable: sql`excluded.is_quotable`,
        isTradable: sql`excluded.is_tradable`,
        logoUrl: sql`excluded.logo_url`,
        syncedAt: sql`now()`,
      },
    });
}
 
/**
 * Deletes all positions for an account.
 * Called when an account is deactivated or before a full re-sync.
 *
 * @example
 * await deletePositionsByAccount(db, accountId);
 */
export async function deletePositionsByAccount(
  db: DB,
  accountId: string
): Promise<void> {
  await db.delete(positions).where(eq(positions.accountId, accountId));
}
 
// ---------------------------------------------------------------------------
// Single row reads
// ---------------------------------------------------------------------------
 
/**
 * Fetch a single position by internal id.
 *
 * @example
 * const position = await getPositionById(db, id);
 */
export async function getPositionById(
  db: DB,
  id: string
): Promise<Position | null> {
  const rows = await db
    .select()
    .from(positions)
    .where(eq(positions.id, id))
    .limit(1);
  return rows[0] ?? null;
}
 
/**
 * Fetch a specific position by account + ticker symbol.
 *
 * @example
 * const position = await getPositionBySymbol(db, accountId, "AAPL");
 */
export async function getPositionBySymbol(
  db: DB,
  accountId: string,
  symbol: string
): Promise<Position | null> {
  const rows = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.symbol, symbol)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
 
// ---------------------------------------------------------------------------
// Collection reads
// ---------------------------------------------------------------------------
 
/**
 * Fetch all current positions for a single account.
 * Primary query for the portfolio view.
 *
 * @example
 * const positions = await getPositionsByAccount(db, accountId);
 */
export async function getPositionsByAccount(
  db: DB,
  accountId: string
): Promise<Position[]> {
  return db
    .select()
    .from(positions)
    .where(eq(positions.accountId, accountId));
}
 
/**
 * Fetch positions across multiple accounts in one query.
 * Used for the aggregate portfolio view when a user has several accounts.
 *
 * @example
 * const all = await getPositionsByAccounts(db, [accountId1, accountId2]);
 */
export async function getPositionsByAccounts(
  db: DB,
  accountIds: string[]
): Promise<Position[]> {
  if (accountIds.length === 0) return [];
  return db
    .select()
    .from(positions)
    .where(inArray(positions.accountId, accountIds));
}
 
/**
 * Fetch all positions for a given ticker across multiple accounts.
 * Answers "how much AAPL do I hold in total across all my accounts?".
 *
 * @example
 * const positions = await getPositionsBySymbolAcrossAccounts(db, accountIds, "AAPL");
 */
export async function getPositionsBySymbolAcrossAccounts(
  db: DB,
  accountIds: string[],
  symbol: string
): Promise<Position[]> {
  if (accountIds.length === 0) return [];
  return db
    .select()
    .from(positions)
    .where(
      and(
        inArray(positions.accountId, accountIds),
        eq(positions.symbol, symbol)
      )
    );
}
 
/**
 * Fetch only cash-equivalent positions for an account.
 * Used to display available cash separately from invested positions.
 *
 * @example
 * const cash = await getCashPositionsByAccount(db, accountId);
 */
export async function getCashPositionsByAccount(
  db: DB,
  accountId: string
): Promise<Position[]> {
  return db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.cashEquivalent, true)
      )
    );
}
 
/**
 * Fetch only non-cash (invested) positions for an account.
 * Used to display the securities portion of the portfolio.
 *
 * @example
 * const invested = await getInvestedPositionsByAccount(db, accountId);
 */
export async function getInvestedPositionsByAccount(
  db: DB,
  accountId: string
): Promise<Position[]> {
  return db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, accountId),
        eq(positions.cashEquivalent, false)
      )
    );
}
 
/**
 * Fetch all positions for a given FIGI code across multiple accounts.
 * Use this to join positions against an external market data provider.
 *
 * @example
 * const positions = await getPositionsByFigi(db, accountIds, "BBG000B9XRY4");
 */
export async function getPositionsByFigi(
  db: DB,
  accountIds: string[],
  figiCode: string
): Promise<Position[]> {
  if (accountIds.length === 0) return [];
  return db
    .select()
    .from(positions)
    .where(
      and(
        inArray(positions.accountId, accountIds),
        eq(positions.figiCode, figiCode)
      )
    );
}
