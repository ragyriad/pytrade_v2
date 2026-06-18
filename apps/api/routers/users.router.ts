import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc.js";
import { eq, users } from "@repo/db";

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const updateProfileInput = z.object({
  username: z.string().min(1).max(64).optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const usersRouter = router({
  /**
   * GET /trpc/users.me
   * Returns the DB row for the authenticated user.
   * The row mirrors the Clerk user — created on first sign-in via webhook.
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(users)
      .where(eq(users.username, ctx.userId))
      .limit(1);

    if (!rows[0]) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User record not found. Try signing out and back in.",
      });
    }

    return rows[0];
  }),

  /**
   * MUTATION /trpc/users.updateProfile
   * Updates mutable profile fields (display name, avatar, timezone, currency).
   * Clerk is the source of truth for auth — only local preferences live here.
   */
  updateProfile: protectedProcedure
    .input(updateProfileInput)
    .mutation(async ({ ctx, input }) => {
      const patch = {
        ...input,
        updatedAt: new Date(),
      };

      const rows = await ctx.db
        .update(users)
        .set(patch)
        .where(eq(users.username, ctx.userId))
        .returning();

      if (!rows[0]) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User record not found.",
        });
      }

      return rows[0];
    }),

  /**
   * MUTATION /trpc/users.provision
   * Called by the Clerk webhook (user.created event) via the Fastify REST layer.
   * Creates the local user row that mirrors the Clerk profile.
   * Exposed as a public procedure — auth comes from the webhook signature, not a session.
   */
  provision: publicProcedure
    .input(
      z.object({
        clerkId: z.string(),
        username: z.string().min(1).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select()
        .from(users)
        .where(eq(users.username, input.username ?? input.clerkId))
        .limit(1);

      // Idempotent — safe to call multiple times for the same Clerk user.
      if (existing[0]) return existing[0];

      const rows = await ctx.db
        .insert(users)
        .values({
          username: input.username ?? input.clerkId,
        })
        .returning();

      return rows[0];
    }),

  /**
   * MUTATION /trpc/users.delete
   * Soft or hard delete — invoked by the Clerk user.deleted webhook.
   * Currently hard-deletes the user row. Cascade rules on the DB handle
   * linked accounts, positions, and transactions.
   */
  delete: publicProcedure
    .input(z.object({ clerkId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(users).where(eq(users.username, input.clerkId));
      return { success: true };
    }),
});

export type UsersRouter = typeof usersRouter;
