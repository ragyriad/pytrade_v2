import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { UserManagement } from "../../app/components/admin/userManagement";

const users = [
  {
    id: "user_admin",
    email: "admin@example.com",
    name: "Admin User",
    imageUrl: "",
    role: "admin" as const,
    status: "active" as const,
    lastSignInAt: null,
    createdAt: 1,
  },
  {
    id: "user_member",
    email: "member@example.com",
    name: "Member User",
    imageUrl: "",
    role: "user" as const,
    status: "active" as const,
    lastSignInAt: null,
    createdAt: 1,
  },
];

describe("UserManagement", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("shows users, roles, access status, and pending invitations", () => {
    render(
      <UserManagement
        initialUsers={users}
        initialInvitations={[{
          id: "inv_1",
          email: "pending@example.com",
          role: "user",
          status: "pending",
          createdAt: 1,
        }]}
        currentUserId="user_admin"
      />
    );

    expect(screen.getByText("Admin User (you)")).toBeInTheDocument();
    expect(screen.getByText("Member User")).toBeInTheDocument();
    expect(screen.getByText("pending@example.com")).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Disable" }).find((button) => !button.hasAttribute("disabled"))
    ).toBeDefined();
  });

  test("creates an invitation and refreshes the list", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "inv_2" }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ users, invitations: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserManagement initialUsers={users} initialInvitations={[]} currentUserId="user_admin" />
    );
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "New User" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(screen.getByText("Invitation sent.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "new@example.com", username: "New User", role: "user" }),
      })
    );
  });

  test("disables another user through the management endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ success: true }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          users: [users[0], { ...users[1], status: "disabled" }],
          invitations: [],
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <UserManagement initialUsers={users} initialInvitations={[]} currentUserId="user_admin" />
    );
    const enabledDisableButton = screen
      .getAllByRole("button", { name: "Disable" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(enabledDisableButton).toBeDefined();
    fireEvent.click(enabledDisableButton!);

    await waitFor(() => expect(screen.getByText("User updated.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/users",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ action: "disable", userId: "user_member" }),
      })
    );
  });
});
