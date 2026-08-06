import { beforeEach, describe, expect, test } from "vitest";
import { db, eq, users } from "@repo/db";
import { ensureDemoApplicationUser } from "../../src/demo/user.js";
import { truncateApplicationTables } from "../../../../test/integration/support/database";

describe("demo application user provisioning", () => {
  beforeEach(truncateApplicationTables);

  test("creates an active linked demo user", async () => {
    const created = await ensureDemoApplicationUser(db, {
      username: "demouser",
      clerkUserId: "user_DemoSeed123",
      email: "demo@example.com",
      dryRun: false,
    });

    const [persisted] = await db.select().from(users).where(eq(users.id, created.id));
    expect(persisted).toMatchObject({
      username: "demouser",
      clerkUserId: "user_DemoSeed123",
      email: "demo@example.com",
      status: "active",
      role: "user",
    });
  });

  test("links and activates an existing unlinked demo user", async () => {
    const [existing] = await db
      .insert(users)
      .values({ username: "demouser", status: "pending" })
      .returning();

    const updated = await ensureDemoApplicationUser(db, {
      username: "demouser",
      clerkUserId: "user_DemoSeed456",
      dryRun: false,
    });

    expect(updated.id).toBe(existing.id);
    const [persisted] = await db.select().from(users).where(eq(users.id, existing.id));
    expect(persisted).toMatchObject({
      clerkUserId: "user_DemoSeed456",
      status: "active",
    });
  });

  test("refuses to reuse a Clerk identity linked to another user", async () => {
    await db.insert(users).values({
      username: "another-user",
      clerkUserId: "user_AlreadyLinked",
    });

    await expect(ensureDemoApplicationUser(db, {
      username: "demouser",
      clerkUserId: "user_AlreadyLinked",
      dryRun: false,
    })).rejects.toThrow("already linked");
  });
});
