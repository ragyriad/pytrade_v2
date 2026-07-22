import { eq, inArray, and } from "drizzle-orm";
import { DB } from "../db_type.js";
import { positions, Position, NewPosition } from "../schemas/positions_schema.js";
 
// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------
 
type PositionIdentity = Pick<
  NewPosition,
  "snaptradeInstrumentId" | "snaptradeSymbolId" | "symbol"
>;

/** Prefer SnapTrade's stable UniversalSymbol id, with fallbacks for brokers
 * that omit it. */
function getPositionIdentity(position: PositionIdentity): string {
  const instrumentId = position.snaptradeInstrumentId?.trim();
  if (instrumentId) return `instrument:${instrumentId}`;

  const positionSymbolId = position.snaptradeSymbolId?.trim();
  if (positionSymbolId) return `position-symbol:${positionSymbolId}`;

  return `ticker:${position.symbol.trim().toUpperCase()}`;
}

async function upsertPositionRows(
  db: DB,
  accountId: string,
  data: NewPosition[]
): Promise<Set<string>> {
  const current = await db
    .select()
    .from(positions)
    .where(eq(positions.accountId, accountId));
  const currentByIdentity = new Map(
    current.map((position) => [getPositionIdentity(position), position])
  );
  const incomingByIdentity = new Map(
    data.map((position) => [getPositionIdentity(position), position])
  );
  const retainedIds = new Set<string>();

  for (const incoming of incomingByIdentity.values()) {
    if (incoming.accountId !== accountId) {
      throw new Error(
        `Cannot sync position for account ${incoming.accountId} into ${accountId}`
      );
    }

    const existing = currentByIdentity.get(getPositionIdentity(incoming));
    const { id: _id, createdAt: _createdAt, ...values } = incoming;
    const syncedAt = incoming.syncedAt ?? new Date();

    if (existing) {
      await db
        .update(positions)
        .set({ ...values, syncedAt })
        .where(eq(positions.id, existing.id));
      retainedIds.add(existing.id);
      continue;
    }

    const inserted = await db
      .insert(positions)
      .values({ ...values, syncedAt })
      .returning({ id: positions.id });
    retainedIds.add(inserted[0].id);
  }

  return retainedIds;
}

/**
 * Reconciles a complete positions snapshot without deleting and recreating
 * unchanged rows. New holdings are inserted and only holdings absent from the
 * latest SnapTrade snapshot are removed.
 */
export async function reconcileAccountPositions(
  db: DB,
  accountId: string,
  data: NewPosition[]
): Promise<void> {
  await db.transaction(async (tx) => {
    const retainedIds = await upsertPositionRows(tx, accountId, data);
    const current = await tx
      .select({ id: positions.id })
      .from(positions)
      .where(eq(positions.accountId, accountId));
    const staleIds = current
      .map(({ id }) => id)
      .filter((id) => !retainedIds.has(id));

    if (staleIds.length > 0) {
      await tx.delete(positions).where(inArray(positions.id, staleIds));
    }
  });
}

/** @deprecated Use reconcileAccountPositions. */
export const replaceAccountPositions = reconcileAccountPositions;
 
/**
 * Upserts partial position data using SnapTrade instrument identifiers where
 * available. Unlike reconciliation, this does not remove missing rows.
 *
 * @example
 * await upsertPositions(db, mappedPositions);
 */
export async function upsertPositions(
  db: DB,
  data: NewPosition[]
): Promise<void> {
  if (data.length === 0) return;
 
  const byAccount = new Map<string, NewPosition[]>();
  for (const position of data) {
    const accountPositions = byAccount.get(position.accountId) ?? [];
    accountPositions.push(position);
    byAccount.set(position.accountId, accountPositions);
  }
  await db.transaction(async (tx) => {
    for (const [accountId, accountPositions] of byAccount) {
      await upsertPositionRows(tx, accountId, accountPositions);
    }
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
