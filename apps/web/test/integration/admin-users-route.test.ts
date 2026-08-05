import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUsers: vi.fn(),
  createClerkUser: vi.fn(),
  setPasswordCompromised: vi.fn(),
  deleteClerkUser: vi.fn(),
  banClerkUser: vi.fn(),
  unbanClerkUser: vi.fn(),
  updateClerkUserMetadata: vi.fn(),
}));

const clerkClient = {
  users: {
    createUser: mocks.createClerkUser,
    setPasswordCompromised: mocks.setPasswordCompromised,
    deleteUser: mocks.deleteClerkUser,
    banUser: mocks.banClerkUser,
    unbanUser: mocks.unbanClerkUser,
    updateUserMetadata: mocks.updateClerkUserMetadata,
  },
};

vi.mock("../../app/lib/clerkAdmin", () => ({
  requireApplicationAdmin: mocks.requireAdmin,
  listApplicationUsers: mocks.listUsers,
}));

import { db, eq, users } from "@repo/db";
import { PATCH, POST } from "../../app/api/admin/users/route";
import { truncateApplicationTables } from "../../../../test/integration/support/database";
import { USER_A_ID, USER_B_ID } from "../../../../test/integration/support/fixtures";

function createRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "created_user",
      password: "Temporary!123",
      email: "created@example.test",
      role: "user",
      requirePasswordReset: true,
      ...overrides,
    }),
  });
}

describe("admin user route with PostgreSQL", () => {
  beforeEach(async () => {
    await truncateApplicationTables();
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      userId: "user_admin",
      localUser: { id: USER_A_ID, role: "admin", status: "active" },
      client: clerkClient,
    });
    mocks.createClerkUser.mockResolvedValue({ id: "user_created" });
    mocks.setPasswordCompromised.mockResolvedValue({ id: "user_created" });
    mocks.deleteClerkUser.mockResolvedValue({ id: "user_created" });
  });

  test("persists a Clerk-created user with the same application UUID", async () => {
    const response = await POST(createRequest());
    const body = await response.json();
    const [persisted] = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, "user_created"));

    expect(response.status).toBe(201);
    expect(persisted).toMatchObject({
      id: body.applicationUserId,
      clerkUserId: "user_created",
      username: "created_user",
      email: "created@example.test",
      role: "user",
      status: "active",
    });
    expect(mocks.createClerkUser).toHaveBeenCalledWith(expect.objectContaining({
      externalId: body.applicationUserId,
      publicMetadata: expect.objectContaining({ applicationUserId: body.applicationUserId }),
    }));
  });

  test("rejects duplicate local identity data before creating a Clerk user", async () => {
    await db.insert(users).values({
      id: USER_B_ID,
      username: "created_user",
      email: "existing@example.test",
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "That username is already in use." });
    expect(mocks.createClerkUser).not.toHaveBeenCalled();
  });

  test("bans Clerk and soft-disables the linked local user", async () => {
    await db.insert(users).values({
      id: USER_B_ID,
      username: "disable_user",
      clerkUserId: "user_disable",
      status: "active",
    });
    const request = new Request("http://localhost/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", userId: "user_disable" }),
    });

    const response = await PATCH(request);
    const [persisted] = await db.select().from(users).where(eq(users.id, USER_B_ID));

    expect(response.status).toBe(200);
    expect(mocks.banClerkUser).toHaveBeenCalledWith("user_disable");
    expect(persisted.status).toBe("disabled");
  });
});
