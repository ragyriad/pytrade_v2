import { defineRelations } from "drizzle-orm";
import { accounts } from "./accounts_schema.js";
import { accountBalances } from "./account_balances_schema.js";
import { accountValueHistory } from "./account_value_history_schema.js";
import { calendarEvents } from "./calendar_events_schema.js";
import { holdings } from "./holdings_schema.js";
import { options } from "./options_schema.js";
import { orders } from "./orders_schema.js";
import { positions } from "./positions_schema.js";
import { securityAliases } from "./security_aliases_schema.js";
import { securityPriceSnapshots } from "./security_price_snapshots_schema.js";
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
  { accounts, transactions, users, positions, holdings, accountBalances, accountValueHistory, orders },
  (r) => ({
    accounts: {
      transactions: r.many.transactions({
        from: r.accounts.id,
        to: r.transactions.accountId,
      }),
      positions: r.many.positions({
        from: r.accounts.id,
        to: r.positions.accountId,
      }),
      holdings: r.many.holdings({
        from: r.accounts.id,
        to: r.holdings.accountId,
      }),
      balances: r.many.accountBalances({
        from: r.accounts.id,
        to: r.accountBalances.accountId,
      }),
      valueHistory: r.many.accountValueHistory({
        from: r.accounts.id,
        to: r.accountValueHistory.accountId,
      }),
      orders: r.many.orders({
        from: r.accounts.id,
        to: r.orders.accountId,
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
  { securities, transactions, securityAliases, options, calendarEvents, positions, holdings, orders, securityPriceSnapshots },
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
      positions: r.many.positions({
        from: r.securities.id,
        to: r.positions.securityId,
      }),
      holdings: r.many.holdings({
        from: r.securities.id,
        to: r.holdings.securityId,
      }),
      underlyingHoldings: r.many.holdings({
        from: r.securities.id,
        to: r.holdings.underlyingSecurityId,
      }),
      orders: r.many.orders({
        from: r.securities.id,
        to: r.orders.securityId,
      }),
      calendarEvents: r.many.calendarEvents({
        from: r.securities.id,
        to: r.calendarEvents.securityId,
      }),
      priceSnapshots: r.many.securityPriceSnapshots({
        from: r.securities.id,
        to: r.securityPriceSnapshots.securityId,
      }),
    },
  })
);

export const positionsRelations = defineRelations(
  { positions, accounts, securities },
  (r) => ({
    positions: {
      account: r.one.accounts({
        from: r.positions.accountId,
        to: r.accounts.id,
      }),
      security: r.one.securities({
        from: r.positions.securityId,
        to: r.securities.id,
        optional: true,
      }),
    },
  })
);

export const holdingsRelations = defineRelations(
  { holdings, accounts, securities },
  (r) => ({
    holdings: {
      account: r.one.accounts({
        from: r.holdings.accountId,
        to: r.accounts.id,
      }),
      security: r.one.securities({
        from: r.holdings.securityId,
        to: r.securities.id,
        optional: true,
      }),
      underlyingSecurity: r.one.securities({
        from: r.holdings.underlyingSecurityId,
        to: r.securities.id,
        optional: true,
      }),
    },
  })
);

export const accountBalancesRelations = defineRelations(
  { accountBalances, accounts },
  (r) => ({
    accountBalances: {
      account: r.one.accounts({
        from: r.accountBalances.accountId,
        to: r.accounts.id,
      }),
    },
  })
);

export const accountValueHistoryRelations = defineRelations(
  { accountValueHistory, accounts },
  (r) => ({
    accountValueHistory: {
      account: r.one.accounts({
        from: r.accountValueHistory.accountId,
        to: r.accounts.id,
      }),
    },
  })
);

export const ordersRelations = defineRelations(
  { orders, accounts, securities },
  (r) => ({
    orders: {
      account: r.one.accounts({
        from: r.orders.accountId,
        to: r.accounts.id,
      }),
      security: r.one.securities({
        from: r.orders.securityId,
        to: r.securities.id,
        optional: true,
      }),
    },
  })
);

export const calendarEventsRelations = defineRelations(
  { calendarEvents, securities },
  (r) => ({
    calendarEvents: {
      security: r.one.securities({
        from: r.calendarEvents.securityId,
        to: r.securities.id,
        optional: true,
      }),
    },
  })
);

export const securityPriceSnapshotsRelations = defineRelations(
  { securityPriceSnapshots, securities },
  (r) => ({
    securityPriceSnapshots: {
      security: r.one.securities({
        from: r.securityPriceSnapshots.securityId,
        to: r.securities.id,
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
