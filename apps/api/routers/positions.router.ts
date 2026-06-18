import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import {
  getAccountById,
  getActiveAccountsByUserId,
  getPositionById,
  getPositionBySymbol,
  getPositionsByAccount,
  getPositionsByAccounts,
  getPositionsBySymbolAcrossAccounts,
  getCashPositionsByAccount,
  getInvestedPositionsByAccount,
  getPositionsByFigi,
  deletePositionsByAccount,
} from "@repo/db";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const accountIdInput = z.object({
  accountId: z.string().uuid(),
});

const symbolLookupInput = z.object({
  accountId: z.string().uuid(),
  symbol: z.string().min(1).toUpperCase(),
});

const crossAccountSymbolInput = z.object({
  symbol: z.string().min(1).toUpperCase(),
});

const figiLookupInput = z.object({
  figiCode: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Guard: account must exist and belong to the calling user. */
async function assertAccountOwnership(
  db: Parameters<typeof getAccountById>[0],
  accountId: string,
  userId: string
) {
  const account = await getAccountById(db, accountId);
  if (!account) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Account not found." });
  }
  if (account.userId !== userId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have access to this account.",
    });
  }
  return account;
}

/** Return all active account IDs for a user — used for cross-account queries. */
async function getUserAccountIds(
  db: Parameters<typeof getAccountById>[0],
  userId: string
): Promise<string[]> {
  const accounts = await getActiveAccountsByUserId(db, userId);
  return accounts.map((a) => a.id);
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const positionsRouter = router({
  /**
   * GET /trpc/positions.byAccount
   * All current positions for a single account.
   * Primary query for the single-account portfolio view.
   */
  byAccount: protectedProcedure
    .input(accountIdInput)
    .query(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      return getPositionsByAccount(ctx.db, input.accountId);
    }),

  /**
   * GET /trpc/positions.investedByAccount
   * Only non-cash (security) positions for an account.
   * Use for the "Holdings" section of the portfolio view.
   */
  investedByAccount: protectedProcedure
    .input(accountIdInput)
    .query(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      return getInvestedPositionsByAccount(ctx.db, input.accountId);
    }),

  /**
   * GET /trpc/positions.cashByAccount
   * Only cash-equivalent positions for an account.
   * Use for the "Available Cash" section of the portfolio view.
   */
  cashByAccount: protectedProcedure
    .input(accountIdInput)
    .query(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      return getCashPositionsByAccount(ctx.db, input.accountId);
    }),

  /**
   * GET /trpc/positions.aggregate
   * All positions across all active accounts for the user.
   * Powers the top-level portfolio dashboard — no account filter needed.
   */
  aggregate: protectedProcedure.query(async ({ ctx }) => {
    const accountIds = await getUserAccountIds(ctx.db, ctx.userId);
    if (accountIds.length === 0) return [];
    return getPositionsByAccounts(ctx.db, accountIds);
  }),

  /**
   * GET /trpc/positions.bySymbol
   * A specific holding within a single account.
   * Used for position detail drawers.
   */
  bySymbol: protectedProcedure
    .input(symbolLookupInput)
    .query(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      const position = await getPositionBySymbol(
        ctx.db,
        input.accountId,
        input.symbol
      );
      if (!position) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `No position found for symbol ${input.symbol} in this account.`,
        });
      }
      return position;
    }),

  /**
   * GET /trpc/positions.byId
   * Single position by internal UUID.
   * Used when you already hold the position id (e.g. from a list item).
   */
  byId: protectedProcedure
    .input(z.object({ positionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const position = await getPositionById(ctx.db, input.positionId);
      if (!position) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Position not found.",
        });
      }
      // Verify the position's account belongs to the caller.
      await assertAccountOwnership(ctx.db, position.accountId, ctx.userId);
      return position;
    }),

  /**
   * GET /trpc/positions.symbolAcrossAccounts
   * All holdings of a ticker across every active account.
   * "How much AAPL do I own in total?" aggregation query.
   */
  symbolAcrossAccounts: protectedProcedure
    .input(crossAccountSymbolInput)
    .query(async ({ ctx, input }) => {
      const accountIds = await getUserAccountIds(ctx.db, ctx.userId);
      if (accountIds.length === 0) return [];
      return getPositionsBySymbolAcrossAccounts(
        ctx.db,
        accountIds,
        input.symbol
      );
    }),

  /**
   * GET /trpc/positions.byFigi
   * All holdings identified by a FIGI code across active accounts.
   * Used when joining positions to an external market data provider.
   */
  byFigi: protectedProcedure
    .input(figiLookupInput)
    .query(async ({ ctx, input }) => {
      const accountIds = await getUserAccountIds(ctx.db, ctx.userId);
      if (accountIds.length === 0) return [];
      return getPositionsByFigi(ctx.db, accountIds, input.figiCode);
    }),

  /**
   * MUTATION /trpc/positions.clearAccount
   * Hard-deletes all positions for an account.
   * Should only be called before triggering a full re-sync job via BullMQ.
   * The sync worker will repopulate via replaceAccountPositions.
   */
  clearAccount: protectedProcedure
    .input(accountIdInput)
    .mutation(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      await deletePositionsByAccount(ctx.db, input.accountId);
      return { success: true };
    }),
});

export type PositionsRouter = typeof positionsRouter;
