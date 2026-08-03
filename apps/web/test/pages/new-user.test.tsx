import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CreateUserPage } from "../../app/pages/createUserPage";

function completeRequiredFields() {
  fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "New_User" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "VeryStrong!123" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "VeryStrong!123" } });
}

describe("admin create-user page", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("collects Clerk identity and local application fields", () => {
    render(<CreateUserPage />);

    const usernameInput = screen.getByLabelText(/^Username/);
    const passwordInput = screen.getByLabelText("Password");
    expect(usernameInput).toBeRequired();
    expect(usernameInput).not.toHaveAttribute("minlength");
    expect(passwordInput).not.toHaveAttribute("minlength");
    expect(screen.getByLabelText(/Email address/)).not.toBeRequired();
    expect(screen.getByLabelText("First name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last name")).toBeInTheDocument();
    expect(screen.getByLabelText("Application role")).toBeInTheDocument();
    expect(screen.getByLabelText(/Require password change/)).toBeChecked();
    expect(screen.getByLabelText("Show password")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: "Generate strong password" })).not.toBeInTheDocument();
  });

  test("does not submit mismatched passwords", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateUserPage />);

    fireEvent.change(screen.getByLabelText(/^Username/), { target: { value: "new_user" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "VeryStrong!123" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Different!123" } });
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The passwords do not match.");
    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("waits for provisioning success and displays the linked identifiers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        applicationUserId: "app_123",
        clerkUserId: "user_123",
        message: "API user created.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CreateUserPage />);
    completeRequiredFields();
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "New" } });
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "User" } });
    fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: "NEW@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Create user" }));

    await waitFor(() => expect(screen.getByText("The Clerk and PyTrade accounts are linked.")).toBeInTheDocument());
    expect(screen.getByText("user_123")).toBeInTheDocument();
    expect(screen.getByText("app_123")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("API user created.");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/users",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          username: "New_User",
          email: "NEW@example.com",
          firstName: "New",
          lastName: "User",
          password: "VeryStrong!123",
          role: "user",
          requirePasswordReset: true,
        }),
      })
    );
  });
});
