import { beforeEach, describe, expect, test } from "vitest";
import {
  accountBalances,
  accounts,
  accountValueHistory,
  db,
  eq,
  positions,
  transactions,
  users,
} from "@repo/db";
import {
  queryTestDatabase,
  truncateApplicationTables,
} from "../../../../test/integration/support/database";
import {
  ACCOUNT_A_ID,
  USER_A_ID,
} from "../../../../test/integration/support/fixtures";

describe("database migrations and constraints", () => {
  beforeEach(truncateApplicationTables);

  test("builds the complete schema from the migration history", async () => {
    const rows = await queryTestDatabase<{ table_name: string }>(`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `);
    const tableNames = rows.map((row) => row.table_name);

    expect(tableNames).toEqual(expect.arrayContaining([
      "users",
      "accounts",
      "transactions",
      "positions",
      "account_balances",
      "account_value_history",
      "securities",
      "calendar_events",
    ]));
  });

  test("enforces user defaults and unique Clerk and email identities", async () => {
    const [created] = await db
      .insert(users)
      .values({ username: "defaults_user" })
      .returning();

    expect(created.role).toBe("user");
    expect(created.status).toBe("active");

    await db.update(users).set({
      clerkUserId: "user_unique",
      email: "unique@example.test",
    }).where(eq(users.id, created.id));

    await expect(db.insert(users).values({
      username: "duplicate_clerk",
      clerkUserId: "user_unique",
    })).rejects.toThrow();
    await expect(db.insert(users).values({
      username: "duplicate_email",
      email: "unique@example.test",
    })).rejects.toThrow();
  });

  test("cascades account deletion to owned snapshots and transactions", async () => {
    await db.insert(users).values({ id: USER_A_ID, username: "cascade_user" });
    await db.insert(accounts).values({
      id: ACCOUNT_A_ID,
      userId: USER_A_ID,
      brokerageAccountNumber: "CASCADE-ACCOUNT",
    });
    await db.insert(transactions).values({
      accountId: ACCOUNT_A_ID,
      snaptradeTransactionId: "cascade-transaction",
      type: "BUY",
      amount: "10",
      tradeDate: new Date("2026-01-01T00:00:00.000Z"),
    });
    await db.insert(positions).values({
      accountId: ACCOUNT_A_ID,
      symbol: "CASC",
      units: "1",
    });
    await db.insert(accountBalances).values({
      accountId: ACCOUNT_A_ID,
      currencyCode: "CAD",
      cash: "10",
    });
    await db.insert(accountValueHistory).values({
      accountId: ACCOUNT_A_ID,
      valueDate: "2026-01-01",
      totalValue: "10",
      currencyCode: "CAD",
    });

    await db.delete(accounts).where(eq(accounts.id, ACCOUNT_A_ID));

    const [transactionRows, positionRows, balanceRows, historyRows] = await Promise.all([
      db.select().from(transactions),
      db.select().from(positions),
      db.select().from(accountBalances),
      db.select().from(accountValueHistory),
    ]);
    expect(transactionRows).toHaveLength(0);
    expect(positionRows).toHaveLength(0);
    expect(balanceRows).toHaveLength(0);
    expect(historyRows).toHaveLength(0);
  });
});
