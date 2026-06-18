import { defineRelations } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";
import { transactions } from "./transactions_schema.js";
import { users } from "./users_schema.js";

export const usersRelations = defineRelations(
  { users, accounts },
  (r) => ({
    users: {
      accounts: r.many.accounts({
        from: r.users.id,
        to: r.accounts.userId,
      }),
    },
  })
);

export const accountsRelations = defineRelations(
  { accounts, transactions, users },
  (r) => ({
    accounts: {
      transactions: r.many.transactions({
        from: r.accounts.id,
        to: r.transactions.accountId,
      }),
      user: r.one.users({
        from: r.accounts.userId,
        to: r.users.id,
      }),
      linkedAccount: r.one.accounts({
        from: r.accounts.linkedAccountId,
        to: r.accounts.brokerageAccountNumber,
        optional: true,
      }),
    },
  })
);

export const transactionsRelations = defineRelations(
  { transactions, accounts },
  (r) => ({
    transactions: {
      account: r.one.accounts({
        from: r.transactions.accountId,
        to: r.accounts.id,
      }),
    },
  })
);