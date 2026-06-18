import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import {
  getAccountById,
  getAccountsByUserId,
  getAccountSummariesByUserId,
  getActiveAccountsByUserId,
  getAccountsByBrokerage,
  getAccountsByIds,
  getUnsyncedAccounts,
  deactivateAccount,
  updateAccountBalance,
} from "@repo/db";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const accountIdInput = z.object({
  accountId: z.string().uuid(),
});

const brokerageInput = z.object({
  brokerageName: z.string().min(1),
});

const balanceUpdateInput = z.object({
  accountId: z.string().uuid(),
  balanceAmount: z.string(),
  balanceCurrency: z.string().length(3),
});

const accountIdsInput = z.object({
  accountIds: z.array(z.string().uuid()).min(1).max(100),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Verify the account belongs to the calling user.
 * Throws FORBIDDEN if not, NOT_FOUND if the account doesn't exist.
 */
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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const accountsRouter = router({
  /**
   * GET /trpc/accounts.list
   * Full account rows for the authenticated user.
   * Used by account management screens.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    return getAccountsByUserId(ctx.db, ctx.userId);
  }),

  /**
   * GET /trpc/accounts.summaries
   * Lightweight account summaries — id, name, type, balance, status.
   * Preferred for sidebar / dashboard list views.
   */
  summaries: protectedProcedure.query(async ({ ctx }) => {
    return getAccountSummariesByUserId(ctx.db, ctx.userId);
  }),

  /**
   * GET /trpc/accounts.active
   * Only accounts with status === "active".
   * Use for portfolio calculations that should exclude closed accounts.
   */
  active: protectedProcedure.query(async ({ ctx }) => {
    return getActiveAccountsByUserId(ctx.db, ctx.userId);
  }),

  /**
   * GET /trpc/accounts.unsynced
   * Accounts that have never had a transaction sync.
   * Exposed so the frontend can prompt a first-sync nudge.
   */
  unsynced: protectedProcedure.query(async ({ ctx }) => {
    return getUnsyncedAccounts(ctx.db, ctx.userId);
  }),

  /**
   * GET /trpc/accounts.byId
   * Single account — validates ownership before returning.
   */
  byId: protectedProcedure.input(accountIdInput).query(async ({ ctx, input }) => {
    return assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
  }),

  /**
   * GET /trpc/accounts.byBrokerage
   * All accounts at a specific brokerage for the user.
   * e.g. all Wealthsimple accounts.
   */
  byBrokerage: protectedProcedure
    .input(brokerageInput)
    .query(async ({ ctx, input }) => {
      return getAccountsByBrokerage(ctx.db, ctx.userId, input.brokerageName);
    }),

  /**
   * GET /trpc/accounts.byIds
   * Batch-fetch multiple accounts by ID.
   * Validates that every returned account belongs to the caller.
   */
  byIds: protectedProcedure
    .input(accountIdsInput)
    .query(async ({ ctx, input }) => {
      const rows = await getAccountsByIds(ctx.db, input.accountIds);
      const unauthorized = rows.find((a) => a.userId !== ctx.userId);
      if (unauthorized) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "One or more accounts do not belong to you.",
        });
      }
      return rows;
    }),

  /**
   * MUTATION /trpc/accounts.updateBalance
   * Manually correct the cached balance on an account.
   * Normally balance is set by the sync worker — this is an escape hatch.
   */
  updateBalance: protectedProcedure
    .input(balanceUpdateInput)
    .mutation(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      await updateAccountBalance(
        ctx.db,
        input.accountId,
        input.balanceAmount,
        input.balanceCurrency
      );
      return { success: true };
    }),

  /**
   * MUTATION /trpc/accounts.deactivate
   * Soft-delete: marks account inactive, does NOT hard-delete.
   * Transactions remain linked to the account after deactivation.
   */
  deactivate: protectedProcedure
    .input(accountIdInput)
    .mutation(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      await deactivateAccount(ctx.db, input.accountId);
      return { success: true };
    }),
});

export type AccountsRouter = typeof accountsRouter;
