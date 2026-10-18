import { beforeEach, describe, expect, test } from "vitest";
import { db } from "@repo/db";
import { getPortfolioDashboard } from "../../src/services/portfolio";
import { getSecurityTransactions } from "../../src/services/securities";
import { truncateApplicationTables } from "../../../../test/integration/support/database";
import {
  SECURITY_A_ID,
  USER_A_ID,
  USER_B_ID,
  seedTwoUserPortfolio,
} from "../../../../test/integration/support/fixtures";

describe("service ownership integration", () => {
  beforeEach(async () => {
    await truncateApplicationTables();
    await seedTwoUserPortfolio();
  });

  test("builds a dashboard using only the authenticated user's records", async () => {
    const dashboard = await getPortfolioDashboard(USER_A_ID);

    expect(dashboard?.summary.user.id).toBe(USER_A_ID);
    expect(dashboard?.summary.accountCount).toBe(1);
    expect(dashboard?.summary.positionCount).toBe(1);
    expect(dashboard?.summary.transactionCount).toBe(1);
    expect(dashboard?.accounts.map((account) => account.name)).toEqual(["User A account"]);
    expect(dashboard?.positions.map((position) => position.symbol)).toEqual(["TST"]);
    expect(dashboard?.transactions.map((transaction) => transaction.symbol)).toEqual(["TST"]);
  });

  test("the Data dashboard includes every account type and its transactions", async () => {
    const dashboard = await getPortfolioDashboard(USER_A_ID, {
      includeAllAccountTypes: true,
    });

    expect(dashboard?.accounts.map((account) => account.type).sort()).toEqual([
      "Cash",
      "Investment",
    ]);
    expect(dashboard?.transactions).toHaveLength(2);
  });

  test("does not return another user's transactions for a shared security lookup", async () => {
    const ownerResult = await getSecurityTransactions(SECURITY_A_ID, USER_A_ID, db);
    const otherUserResult = await getSecurityTransactions(SECURITY_A_ID, USER_B_ID, db);

    expect(ownerResult?.transactions).toHaveLength(1);
    expect(ownerResult?.transactions[0].symbol).toBe("TST");
    expect(otherUserResult?.transactions).toHaveLength(0);
  });
});
