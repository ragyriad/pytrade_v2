import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { UserPage } from "../../app/pages/userPage";

const users = [
  {
    key: "clerk:user_admin",
    clerkUserId: "user_admin",
    applicationUserId: "app_admin",
    username: "admin",
    email: "admin@example.com",
    firstName: "Admin",
    lastName: "User",
    imageUrl: "",
    role: "admin" as const,
    applicationStatus: "active" as const,
    clerkStatus: "active" as const,
    connection: "linked" as const,
    lastSignInAt: null,
    createdAt: 3,
  },
  {
    key: "clerk:user_member",
    clerkUserId: "user_member",
    applicationUserId: "app_member",
    username: "member",
    email: "member@example.com",
    firstName: "Member",
    lastName: "User",
    imageUrl: "",
    role: "user" as const,
    applicationStatus: "active" as const,
    clerkStatus: "active" as const,
    connection: "linked" as const,
    lastSignInAt: null,
    createdAt: 2,
  },
  {
    key: "clerk:user_orphan",
    clerkUserId: "user_orphan",
    applicationUserId: null,
    username: "clerk_only",
    email: null,
    firstName: null,
    lastName: null,
    imageUrl: "",
    role: null,
    applicationStatus: null,
    clerkStatus: "active" as const,
    connection: "clerk-only" as const,
    lastSignInAt: null,
    createdAt: 1,
  },
];

describe("admin user directory", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("shows linked and unmatched identities with an add-user route", () => {
    render(<UserPage initialUsers={users} currentUserId="user_admin" />);

    expect(screen.getAllByText("Admin User (you)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Member User").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Clerk only").length).toBeGreaterThan(0);
    expect(screen.queryByText("Application and Clerk users")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add user" })).toHaveAttribute(
      "href",
      "/admin/users/new"
    );
  });

  test("filters identities by username", () => {
    render(<UserPage initialUsers={users} currentUserId="user_admin" />);
    fireEvent.change(screen.getByLabelText("Search users"), {
      target: { value: "clerk_only" },
    });

    expect(screen.queryByText("Admin User (you)")).not.toBeInTheDocument();
    expect(screen.getAllByText("@clerk_only").length).toBeGreaterThan(0);
  });

  test("disables another linked user through the management endpoint", async () => {
    const updatedUsers = [
      users[0],
      { ...users[1], applicationStatus: "disabled" as const, clerkStatus: "disabled" as const },
      users[2],
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, message: "Access disabled." }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ users: updatedUsers }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<UserPage initialUsers={users} currentUserId="user_admin" />);
    const enabledDisableButton = screen
      .getAllByRole("button", { name: "Disable" })
      .find((button) => !button.hasAttribute("disabled"));
    expect(enabledDisableButton).toBeDefined();
    fireEvent.click(enabledDisableButton!);

    await waitFor(() => expect(screen.getByText("Access disabled.")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Dismiss message" })).toBeInTheDocument();
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
