import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc.js";
import {
  getAccountById,
  getTransactionsByAccount,
  createTransaction,
  deleteTransactionsByAccount,
} from "@repo/db";
import type { NewTransaction } from "@repo/db";
import {
  normalizeSecurityIdentity,
  normalizeTransaction,
} from "@repo/data-normalizer";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const accountIdInput = z.object({
  accountId: z.string().uuid(),
});

const transactionListInput = z.object({
  accountId: z.string().uuid(),
  /**
   * Optional client-side filters applied after DB fetch.
   * The DB query always returns the full account ledger ordered by tradeDate desc.
   * For large ledgers a dedicated paginated query should be added to persistence.
   */
  type: z.string().optional(),
  symbol: z.string().optional(),
  /** ISO date string — inclusive lower bound on tradeDate */
  from: z.string().datetime({ offset: true }).optional(),
  /** ISO date string — inclusive upper bound on tradeDate */
  to: z.string().datetime({ offset: true }).optional(),
  /** Max rows to return after filtering (default 200) */
  limit: z.number().int().min(1).max(1000).default(200),
});

const createTransactionInput = z.object({
  accountId: z.string().uuid(),
  snaptradeTransactionId: z.string(),
  type: z.string(),
  action: z.string().optional(),
  assetType: z.string().optional(),
  description: z.string().optional(),
  amount: z.string(),
  price: z.string().optional(),
  units: z.string().optional(),
  fee: z.string().optional(),
  currencyCode: z.string().length(3),
  symbol: z.string().optional(),
  tradeDate: z.string().datetime({ offset: true }),
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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const transactionsRouter = router({
  /**
   * GET /trpc/transactions.list
   * Returns all transactions for an account, newest first.
   * Supports optional client-side filtering by type, symbol, and date range.
   *
   * Note: the BullMQ worker owns all writes during sync. This endpoint is
   * read-only for the frontend. The `create` mutation below is an escape hatch
   * for manual / test entries only.
   */
  list: protectedProcedure
    .input(transactionListInput)
    .query(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);

      let rows = await getTransactionsByAccount(ctx.db, input.accountId);

      // --- client-side filters (cheap on typical ledger sizes) ---
      if (input.type) {
        rows = rows.filter((t) => t.type === input.type);
      }
      if (input.symbol) {
        const sym = input.symbol.toUpperCase();
        rows = rows.filter((t) => t.symbol?.toUpperCase() === sym);
      }
      if (input.from) {
        const from = new Date(input.from);
        rows = rows.filter((t) => new Date(t.tradeDate) >= from);
      }
      if (input.to) {
        const to = new Date(input.to);
        rows = rows.filter((t) => new Date(t.tradeDate) <= to);
      }

      return rows.slice(0, input.limit);
    }),

  /**
   * GET /trpc/transactions.byId
   * Fetch a single transaction by snaptradeTransactionId.
   * Used for detail drawers / receipts in the UI.
   *
   * We re-fetch the full account list and find in memory — avoids adding a
   * new persistence function for a low-frequency read.
   */
  byId: protectedProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        snaptradeTransactionId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);

      const rows = await getTransactionsByAccount(ctx.db, input.accountId);
      const tx = rows.find(
        (t) => t.snaptradeTransactionId === input.snaptradeTransactionId
      );

      if (!tx) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Transaction not found.",
        });
      }
      return tx;
    }),

  /**
   * MUTATION /trpc/transactions.create
   * Manual transaction entry — escape hatch, not used by the sync worker.
   * The worker calls upsertTransactions directly on the persistence layer.
   */
  create: protectedProcedure
    .input(createTransactionInput)
    .mutation(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      const normalized = normalizeTransaction(input);
      const securityIdentity = normalizeSecurityIdentity({
        symbol: input.symbol,
        description: input.description,
      });

      const data: NewTransaction = {
        ...input,
        action: input.action ?? normalized.action,
        assetType: input.assetType ?? normalized.assetType,
        symbol: securityIdentity.symbol,
        tradeDate: new Date(input.tradeDate),
      };

      return createTransaction(ctx.db, data);
    }),

  /**
   * MUTATION /trpc/transactions.clearAccount
   * Wipes all transactions for an account.
   * Only call this before a full re-sync — data loss is intentional.
   * The sync worker will repopulate via upsertTransactions.
   */
  clearAccount: protectedProcedure
    .input(accountIdInput)
    .mutation(async ({ ctx, input }) => {
      await assertAccountOwnership(ctx.db, input.accountId, ctx.userId);
      await deleteTransactionsByAccount(ctx.db, input.accountId);
      return { success: true };
    }),
});

export type TransactionsRouter = typeof transactionsRouter;
