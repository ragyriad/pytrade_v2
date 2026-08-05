import { beforeEach, describe, expect, test } from "vitest";
import {
  accounts,
  db,
  getAccountBySnaptradeId,
  getAccountValueHistoryByAccount,
  getBalancesByAccount,
  getTransactionsByAccount,
  upsertAccount,
  upsertAccountBalances,
  upsertAccountValueHistory,
  upsertTransaction,
  users,
} from "@repo/db";
import { truncateApplicationTables } from "../../../../test/integration/support/database";
import {
  ACCOUNT_A_ID,
  ACCOUNT_B_ID,
  USER_A_ID,
} from "../../../../test/integration/support/fixtures";

const SNAPTRADE_ACCOUNT_ID = "60000000-0000-4000-8000-000000000006";

describe("database persistence", () => {
  beforeEach(async () => {
    await truncateApplicationTables();
    await db.insert(users).values({ id: USER_A_ID, username: "persistence_user" });
  });

  test("upserts an account without replacing its internal identity", async () => {
    await upsertAccount(db, {
      id: ACCOUNT_A_ID,
      userId: USER_A_ID,
      snaptradeAccountId: SNAPTRADE_ACCOUNT_ID,
      brokerageAccountNumber: "UPSERT-ACCOUNT",
      name: "Before",
      balanceAmount: "100",
      balanceCurrency: "CAD",
    });
    await upsertAccount(db, {
      id: ACCOUNT_B_ID,
      userId: USER_A_ID,
      snaptradeAccountId: SNAPTRADE_ACCOUNT_ID,
      brokerageAccountNumber: "UPSERT-ACCOUNT",
      name: "After",
      balanceAmount: "250",
      balanceCurrency: "CAD",
    });

    const persisted = await getAccountBySnaptradeId(db, SNAPTRADE_ACCOUNT_ID);
    expect(persisted).toMatchObject({
      id: ACCOUNT_A_ID,
      userId: USER_A_ID,
      name: "After",
      balanceAmount: "250.00",
    });
    expect(await db.select().from(accounts)).toHaveLength(1);
  });

  test("keeps transaction, balance, and value-history upserts idempotent", async () => {
    await db.insert(accounts).values({
      id: ACCOUNT_A_ID,
      userId: USER_A_ID,
      brokerageAccountNumber: "IDEMPOTENT-ACCOUNT",
    });

    const baseTransaction = {
      accountId: ACCOUNT_A_ID,
      snaptradeTransactionId: "idempotent-transaction",
      type: "BUY",
      amount: "10",
      currencyCode: "CAD",
      tradeDate: new Date("2026-02-01T00:00:00.000Z"),
    } as const;
    await upsertTransaction(db, baseTransaction);
    await upsertTransaction(db, { ...baseTransaction, amount: "25" });

    await upsertAccountBalances(db, ACCOUNT_A_ID, [{
      accountId: ACCOUNT_A_ID,
      currencyCode: "CAD",
      cash: "100",
    }]);
    await upsertAccountBalances(db, ACCOUNT_A_ID, [{
      accountId: ACCOUNT_A_ID,
      currencyCode: "CAD",
      cash: "125",
    }]);

    await upsertAccountValueHistory(db, ACCOUNT_A_ID, [{
      accountId: ACCOUNT_A_ID,
      valueDate: "2026-02-01",
      totalValue: "1000",
      currencyCode: "CAD",
    }]);
    await upsertAccountValueHistory(db, ACCOUNT_A_ID, [{
      accountId: ACCOUNT_A_ID,
      valueDate: "2026-02-01",
      totalValue: "1100",
      currencyCode: "CAD",
    }]);

    expect(await getTransactionsByAccount(db, ACCOUNT_A_ID)).toHaveLength(1);
    expect((await getTransactionsByAccount(db, ACCOUNT_A_ID))[0].amount).toBe("25.00");
    expect(await getBalancesByAccount(db, ACCOUNT_A_ID)).toHaveLength(1);
    expect((await getBalancesByAccount(db, ACCOUNT_A_ID))[0].cash).toBe("125.00000000");
    expect(await getAccountValueHistoryByAccount(db, ACCOUNT_A_ID)).toHaveLength(1);
    expect((await getAccountValueHistoryByAccount(db, ACCOUNT_A_ID))[0].totalValue)
      .toBe("1100.00000000");
  });

  test("refuses to write another account's balance or value history", async () => {
    await expect(upsertAccountBalances(db, ACCOUNT_A_ID, [{
      accountId: ACCOUNT_B_ID,
      currencyCode: "CAD",
      cash: "1",
    }])).rejects.toThrow("another account");

    await expect(upsertAccountValueHistory(db, ACCOUNT_A_ID, [{
      accountId: ACCOUNT_B_ID,
      valueDate: "2026-01-01",
      totalValue: "1",
      currencyCode: "CAD",
    }])).rejects.toThrow("another account");
  });
});
