import { beforeEach, describe, expect, test, vi } from "vitest";

const clerkMocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { getUser: clerkMocks.getUser } }),
}));

import { db, eq, users } from "@repo/db";
import { resolveApplicationUser } from "../../src/auth/application-user";
import { truncateApplicationTables } from "../../../../test/integration/support/database";
import { USER_A_ID, USER_B_ID } from "../../../../test/integration/support/fixtures";

describe("Clerk application-user linking", () => {
  beforeEach(async () => {
    clerkMocks.getUser.mockReset();
    await truncateApplicationTables();
  });

  test("resolves a linked active user and rejects the same user when disabled", async () => {
    await db.insert(users).values({
      id: USER_A_ID,
      username: "linked_user",
      clerkUserId: "user_linked",
      status: "active",
    });

    await expect(resolveApplicationUser("user_linked", "sk_test"))
      .resolves.toMatchObject({ ok: true, user: { id: USER_A_ID } });

    await db.update(users).set({ status: "disabled" }).where(eq(users.id, USER_A_ID));
    await expect(resolveApplicationUser("user_linked", "sk_test"))
      .resolves.toEqual({ ok: false, reason: "disabled" });
    expect(clerkMocks.getUser).not.toHaveBeenCalled();
  });

  test("activates the exact pending UUID carried by Clerk invitation metadata", async () => {
    await db.insert(users).values({
      id: USER_B_ID,
      username: "pending_user",
      email: "pending@example.test",
      status: "pending",
    });
    clerkMocks.getUser.mockResolvedValue({
      publicMetadata: { applicationUserId: USER_B_ID },
      primaryEmailAddress: { emailAddress: "Pending@Example.test" },
    });

    const resolution = await resolveApplicationUser("user_new_link", "sk_test");
    const [persisted] = await db.select().from(users).where(eq(users.id, USER_B_ID));

    expect(resolution).toMatchObject({ ok: true, user: { id: USER_B_ID } });
    expect(persisted).toMatchObject({
      clerkUserId: "user_new_link",
      email: "pending@example.test",
      status: "active",
    });
  });

  test("leaves PostgreSQL unchanged for an unprovisioned Clerk identity", async () => {
    clerkMocks.getUser.mockResolvedValue({
      publicMetadata: {},
      primaryEmailAddress: { emailAddress: "stranger@example.test" },
    });

    await expect(resolveApplicationUser("user_stranger", "sk_test"))
      .resolves.toEqual({ ok: false, reason: "not-provisioned" });
    expect(await db.select().from(users)).toHaveLength(0);
  });
});
