import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  requireAdmin: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

vi.mock("../../app/lib/clerkAdmin", () => ({
  requireApplicationAdmin: mocks.requireAdmin,
  listApplicationUsers: mocks.listUsers,
}));

vi.mock("../../app/pages/userPage", () => ({
  UserPage: ({ currentUserId }: { currentUserId: string }) => (
    <div>User directory for {currentUserId}</div>
  ),
}));

import AdminUsersPage from "../../app/admin/users/page";

describe("/admin/users", () => {
  beforeEach(() => {
    mocks.notFound.mockClear();
    mocks.requireAdmin.mockReset();
    mocks.listUsers.mockReset();
  });

  test("renders the user directory for an active administrator", async () => {
    const client = {};
    mocks.requireAdmin.mockResolvedValue({
      ok: true,
      userId: "user_admin",
      localUser: { role: "admin", status: "active" },
      client,
    });
    mocks.listUsers.mockResolvedValue({ users: [] });

    render(await AdminUsersPage());

    expect(screen.getByRole("heading", { name: "User management" })).toBeInTheDocument();
    expect(screen.getByText("User directory for user_admin")).toBeInTheDocument();
    expect(mocks.listUsers).toHaveBeenCalledWith(client);
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  test("denies the user directory to a regular user", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Administrator access required.",
    });

    await expect(AdminUsersPage()).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.notFound).toHaveBeenCalledOnce();
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
});
