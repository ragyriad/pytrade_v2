import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  updateResults: [] as unknown[][],
  eq: vi.fn((column: string, value: string) => ({ column, value })),
  getUser: vi.fn(),
  set: vi.fn(),
  whereUpdate: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: () => ({ users: { getUser: mocks.getUser } }),
}));

vi.mock("@repo/db", () => ({
  users: {
    id: "users.id",
    clerkUserId: "users.clerkUserId",
    email: "users.email",
  },
  eq: mocks.eq,
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => mocks.selectResults.shift() ?? []),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: mocks.set.mockImplementation(() => ({
        where: mocks.whereUpdate.mockImplementation(() => ({
          returning: vi.fn(async () => mocks.updateResults.shift() ?? []),
        })),
      })),
    })),
  },
}));

import { resolveApplicationUser } from "../../src/auth/application-user";

const linkedUser = {
  id: "00000000-0000-4000-8000-000000000001",
  clerkUserId: "user_admin",
  email: "admin@example.com",
  username: "admin",
  status: "active",
  role: "admin",
};

describe("resolveApplicationUser", () => {
  beforeEach(() => {
    mocks.selectResults.length = 0;
    mocks.updateResults.length = 0;
    vi.clearAllMocks();
  });

  test("returns an active user already linked to the Clerk identity", async () => {
    mocks.selectResults.push([linkedUser]);

    await expect(resolveApplicationUser("user_admin", "sk_test")).resolves.toEqual({
      ok: true,
      user: linkedUser,
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  test("rejects a locally disabled user before calling Clerk", async () => {
    mocks.selectResults.push([{ ...linkedUser, status: "disabled" }]);

    await expect(resolveApplicationUser("user_admin", "sk_test")).resolves.toEqual({
      ok: false,
      reason: "disabled",
    });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  test("links an invited Clerk identity to the exact pending application UUID", async () => {
    const applicationUserId = "11111111-1111-4111-8111-111111111111";
    const pendingUser = {
      ...linkedUser,
      id: applicationUserId,
      clerkUserId: null,
      email: "invite@example.com",
      status: "pending",
      role: "user",
    };
    const activatedUser = { ...pendingUser, clerkUserId: "user_invited", status: "active" };
    mocks.selectResults.push([], [pendingUser]);
    mocks.updateResults.push([activatedUser]);
    mocks.getUser.mockResolvedValue({
      publicMetadata: { applicationUserId },
      primaryEmailAddress: { emailAddress: "Invite@Example.com" },
    });

    await expect(resolveApplicationUser("user_invited", "sk_test")).resolves.toEqual({
      ok: true,
      user: activatedUser,
    });
    expect(mocks.eq).toHaveBeenCalledWith("users.id", applicationUserId);
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({
      clerkUserId: "user_invited",
      email: "invite@example.com",
      status: "active",
    }));
  });

  test("does not provision a Clerk identity without a pending application user", async () => {
    mocks.selectResults.push([], []);
    mocks.getUser.mockResolvedValue({
      publicMetadata: {},
      primaryEmailAddress: { emailAddress: "stranger@example.com" },
    });

    await expect(resolveApplicationUser("user_stranger", "sk_test")).resolves.toEqual({
      ok: false,
      reason: "not-provisioned",
    });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
