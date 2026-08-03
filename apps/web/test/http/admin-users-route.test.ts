import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listUsers: vi.fn(),
  selectLimit: vi.fn(),
  insertValues: vi.fn(),
  updateWhere: vi.fn(),
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

vi.mock("@repo/db", () => ({
  users: {
    id: "users.id",
    username: "users.username",
    email: "users.email",
  },
  eq: vi.fn((field, value) => ({ field, value })),
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: mocks.selectLimit })),
      })),
    })),
    insert: vi.fn(() => ({ values: mocks.insertValues })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: mocks.updateWhere })),
    })),
  },
}));

vi.mock("../../app/lib/clerkAdmin", () => ({
  requireApplicationAdmin: mocks.requireAdmin,
  listApplicationUsers: mocks.listUsers,
}));

import { GET, PATCH, POST } from "../../app/api/admin/users/route";

function createRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "New_User",
      password: "VeryStrong!123",
      email: "NEW@example.com",
      firstName: "New",
      lastName: "User",
      role: "user",
      requirePasswordReset: true,
      ...overrides,
    }),
  });
}

function updateRequest(overrides: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "disable", userId: "user_regular", ...overrides }),
  });
}

describe("POST /api/admin/users", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      userId: "user_admin",
      localUser: { role: "admin", status: "active" },
      client: clerkClient,
    });
    mocks.selectLimit.mockResolvedValue([]);
    mocks.createClerkUser.mockResolvedValue({ id: "user_new" });
    mocks.setPasswordCompromised.mockResolvedValue({ id: "user_new" });
    mocks.deleteClerkUser.mockResolvedValue({ id: "user_new" });
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.banClerkUser.mockResolvedValue(undefined);
    mocks.unbanClerkUser.mockResolvedValue(undefined);
    mocks.updateClerkUserMetadata.mockResolvedValue(undefined);
    mocks.listUsers.mockResolvedValue({ users: [] });
  });

  test("allows an administrator to fetch the user directory", async () => {
    mocks.listUsers.mockResolvedValueOnce({ users: [{ key: "clerk:user_regular" }] });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ users: [{ key: "clerk:user_regular" }] });
    expect(mocks.listUsers).toHaveBeenCalledWith(clerkClient);
  });

  test("rejects a regular user from fetching the user directory", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Administrator access required.",
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });

  test("creates Clerk first, forces the reset, then persists the linked local user", async () => {
    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({
      applicationUserId: expect.any(String),
      clerkUserId: "user_new",
      message: "User created successfully in Clerk and PyTrade.",
    });
    expect(mocks.createClerkUser).toHaveBeenCalledWith(expect.objectContaining({
      username: "new_user",
      password: "VeryStrong!123",
      skipPasswordChecks: true,
      emailAddress: ["new@example.com"],
      firstName: "New",
      lastName: "User",
      externalId: body.applicationUserId,
      publicMetadata: {
        role: "user",
        applicationUserId: body.applicationUserId,
      },
    }));
    expect(mocks.setPasswordCompromised).toHaveBeenCalledWith("user_new", {
      revokeAllSessions: true,
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      id: body.applicationUserId,
      clerkUserId: "user_new",
      username: "new_user",
      email: "new@example.com",
      status: "active",
    }));
    expect(mocks.createClerkUser.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.insertValues.mock.invocationCallOrder[0]);
  });

  test("allows an administrator to keep the supplied password permanent", async () => {
    const response = await POST(createRequest({
      username: "ab",
      password: "x",
      requirePasswordReset: false,
    }));

    expect(response.status).toBe(201);
    expect(mocks.createClerkUser).toHaveBeenCalledWith(expect.objectContaining({
      username: "ab",
      password: "x",
    }));
    expect(mocks.setPasswordCompromised).not.toHaveBeenCalled();
    expect(mocks.insertValues).toHaveBeenCalledOnce();
  });

  test("rolls back the newly created Clerk identity when local persistence fails", async () => {
    mocks.insertValues.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("rolled back");
    expect(mocks.deleteClerkUser).toHaveBeenCalledWith("user_new");
  });

  test("does not write locally when Clerk rejects the new identity", async () => {
    mocks.createClerkUser.mockRejectedValueOnce({
      errors: [{ longMessage: "Username has already been taken." }],
    });

    const response = await POST(createRequest());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toBe("Username has already been taken.");
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.deleteClerkUser).not.toHaveBeenCalled();
  });

  test("rejects non-admin callers before validating or provisioning", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Administrator access required.",
    });

    const response = await POST(createRequest());

    expect(response.status).toBe(403);
    expect(mocks.createClerkUser).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  test("allows an administrator to disable another user", async () => {
    mocks.selectLimit.mockResolvedValueOnce([{ id: "app_regular", clerkUserId: "user_regular" }]);

    const response = await PATCH(updateRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: "User updated successfully.",
    });
    expect(mocks.banClerkUser).toHaveBeenCalledWith("user_regular");
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
  });

  test("allows an administrator to change another user's role", async () => {
    mocks.selectLimit.mockResolvedValueOnce([{ id: "app_regular", clerkUserId: "user_regular" }]);

    const response = await PATCH(updateRequest({ action: "set-role", role: "admin" }));

    expect(response.status).toBe(200);
    expect(mocks.updateClerkUserMetadata).toHaveBeenCalledWith("user_regular", {
      publicMetadata: { role: "admin" },
    });
    expect(mocks.updateWhere).toHaveBeenCalledOnce();
    expect(mocks.banClerkUser).not.toHaveBeenCalled();
  });

  test("rejects a regular user before disabling another user", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Administrator access required.",
    });

    const response = await PATCH(updateRequest());

    expect(response.status).toBe(403);
    expect(mocks.selectLimit).not.toHaveBeenCalled();
    expect(mocks.banClerkUser).not.toHaveBeenCalled();
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });

  test("rejects a regular user before changing another user's role", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Administrator access required.",
    });

    const response = await PATCH(updateRequest({ action: "set-role", role: "admin" }));

    expect(response.status).toBe(403);
    expect(mocks.selectLimit).not.toHaveBeenCalled();
    expect(mocks.updateClerkUserMetadata).not.toHaveBeenCalled();
    expect(mocks.updateWhere).not.toHaveBeenCalled();
  });
});
