import { router } from "./trpc.js";
import { usersRouter } from "./routers/users.router.js";
import { accountsRouter } from "./routers/accounts.router.js";
import { transactionsRouter } from "./routers/transactions.router.js";

export const appRouter = router({
  users: usersRouter,
  accounts: accountsRouter,
  transactions: transactionsRouter,
});

export type AppRouter = typeof appRouter;
