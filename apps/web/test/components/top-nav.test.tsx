import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@clerk/nextjs", () => {
  function UserButton({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  }
  UserButton.MenuItems = function MenuItems({ children }: { children?: ReactNode }) {
    return <div>{children}</div>;
  };
  UserButton.Link = function UserButtonLink({ label, href }: { label: string; href: string }) {
    return <a href={href}>{label}</a>;
  };
  return {
    UserButton,
    useUser: () => ({ isLoaded: true }),
  };
});

import { TopNav } from "../../app/components/navigation/topNav";

describe("TopNav administration visibility", () => {
  test("shows the user-management navigation only to application admins", () => {
    render(<TopNav isAdmin />);

    expect(screen.getAllByRole("link", { name: "Users" }).length).toBeGreaterThan(0);
    for (const link of screen.getAllByRole("link", { name: "Manage users" })) {
      expect(link).toHaveAttribute("href", "/admin/users");
    }
  });

  test("hides all user-management navigation from non-admin users", () => {
    render(<TopNav isAdmin={false} />);

    expect(screen.queryByRole("link", { name: "Users" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Manage users" })).not.toBeInTheDocument();
  });
});
