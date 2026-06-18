import { initTRPC, TRPCError } from "@trpc/server";
import type { FastifyRequest, FastifyReply } from "fastify";
import type { DB } from "@repo/db";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

export interface TRPCContext {
  req: FastifyRequest;
  res: FastifyReply;
  db: DB;
  /** Clerk userId — populated by the auth middleware, null on public routes */
  userId: string | null;
}

const t = initTRPC.context<TRPCContext>().create();

// ---------------------------------------------------------------------------
// Base exports
// ---------------------------------------------------------------------------

export const router = t.router;
export const publicProcedure = t.procedure;

// ---------------------------------------------------------------------------
// Auth guard — enforces Clerk session on every protected procedure
// ---------------------------------------------------------------------------

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});
