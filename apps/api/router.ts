import { router } from "./trpc.js";
import { usersRouter } from "./routers/users.router.js";
import { accountsRouter } from "./routers/accounts.router.js";
import { transactionsRouter } from "./routers/transactions.router.js";
import { positionsRouter } from "./routers/positions.router.js";

// ---------------------------------------------------------------------------
// Root router — compose all domain routers here
// ---------------------------------------------------------------------------

export const appRouter = router({
  users: usersRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
  positions: positionsRouter,
});

export type AppRouter = typeof appRouter;
