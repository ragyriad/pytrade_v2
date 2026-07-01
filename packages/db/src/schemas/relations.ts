import { defineRelations } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";
import { options } from "./options_schema.js";
import { securityAliases } from "./security_aliases_schema.js";
import { securities } from "./securities_schema.js";
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
  { transactions, accounts, securities, options },
  (r) => ({
    transactions: {
      account: r.one.accounts({
        from: r.transactions.accountId,
        to: r.accounts.id,
      }),
      security: r.one.securities({
        from: r.transactions.securityId,
        to: r.securities.id,
        optional: true,
      }),
      underlyingSecurity: r.one.securities({
        from: r.transactions.underlyingSecurityId,
        to: r.securities.id,
        optional: true,
      }),
      option: r.one.options({
        from: r.transactions.optionId,
        to: r.options.id,
        optional: true,
      }),
    },
  })
);

export const securitiesRelations = defineRelations(
  { securities, transactions, securityAliases, options },
  (r) => ({
    securities: {
      transactions: r.many.transactions({
        from: r.securities.id,
        to: r.transactions.securityId,
      }),
      underlyingTransactions: r.many.transactions({
        from: r.securities.id,
        to: r.transactions.underlyingSecurityId,
      }),
      options: r.many.options({
        from: r.securities.id,
        to: r.options.underlyingSecurityId,
      }),
      option: r.one.options({
        from: r.securities.id,
        to: r.options.securityId,
        optional: true,
      }),
      aliases: r.many.securityAliases({
        from: r.securities.id,
        to: r.securityAliases.securityId,
      }),
    },
  })
);

export const optionsRelations = defineRelations(
  { options, securities, transactions },
  (r) => ({
    options: {
      security: r.one.securities({
        from: r.options.securityId,
        to: r.securities.id,
      }),
      underlyingSecurity: r.one.securities({
        from: r.options.underlyingSecurityId,
        to: r.securities.id,
      }),
      transactions: r.many.transactions({
        from: r.options.id,
        to: r.transactions.optionId,
      }),
    },
  })
);

export const securityAliasesRelations = defineRelations(
  { securityAliases, securities },
  (r) => ({
    securityAliases: {
      security: r.one.securities({
        from: r.securityAliases.securityId,
        to: r.securities.id,
      }),
    },
  })
);
