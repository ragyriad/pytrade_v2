"use client";

import { useState, type FormEvent } from "react";
import type {
  ApplicationRole,
  ManagedInvitation,
  ManagedUser,
} from "../../lib/clerkAdmin";

type UserManagementProps = {
  initialUsers: ManagedUser[];
  initialInvitations: ManagedInvitation[];
  currentUserId: string;
};

function formatDate(value: number | null): string {
  return value == null ? "Never" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value);
}

export function UserManagement({
  initialUsers,
  initialInvitations,
  currentUserId,
}: UserManagementProps) {
  const [users, setUsers] = useState(initialUsers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<ApplicationRole>("user");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Unable to refresh users.");
    setUsers(body.users);
    setInvitations(body.invitations);
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, role }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to invite user.");
      setEmail("");
      setUsername("");
      setRole("user");
      await refresh();
      setMessage("Invitation sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to invite user.");
    } finally {
      setBusy(false);
    }
  }

  async function updateUser(payload: Record<string, string>) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to update user.");
      await refresh();
      setMessage("User updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update user.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6">
      <section className="app-panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Invite a user</h2>
        <p className="mt-1 text-sm text-muted">
          Clerk emails a secure invitation. The recipient completes registration on PyTrade.
        </p>
        <form className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_12rem_auto]" onSubmit={invite}>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Email
            <input
              className="h-10 rounded-md border border-border bg-surface px-3"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="person@example.com"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Username
            <input
              className="h-10 rounded-md border border-border bg-surface px-3"
              required
              maxLength={64}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Display name"
            />
          </label>
          <label className="grid gap-1 text-sm font-medium text-foreground">
            Role
            <select
              className="h-10 rounded-md border border-border bg-surface px-3"
              value={role}
              onChange={(event) => setRole(event.target.value as ApplicationRole)}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <button className="self-end rounded-md bg-action-strong px-4 py-2 text-sm font-semibold text-on-action disabled:opacity-50" disabled={busy}>
            Send invitation
          </button>
        </form>
        {message ? <p className="mt-4 text-sm text-muted" role="status">{message}</p> : null}
      </section>

      <section className="app-panel overflow-hidden">
        <div className="border-b border-border p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-foreground">Application users</h2>
          <p className="mt-1 text-sm text-muted">
            PyTrade owns roles and data access; Clerk supplies sign-in and session controls.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border bg-interactive-surface text-muted">
              <tr><th className="p-3">User</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Last sign-in</th><th className="p-3">Actions</th></tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr className="border-b border-border last:border-0" key={user.id}>
                  <td className="p-3"><div className="font-medium text-foreground">{user.name}{user.id === currentUserId ? " (you)" : ""}</div><div className="text-muted">{user.email}</div></td>
                  <td className="p-3">
                    <select
                      aria-label={`Role for ${user.email}`}
                      className="h-9 rounded-md border border-border bg-surface px-2"
                      disabled={busy || user.id === currentUserId}
                      value={user.role}
                      onChange={(event) => updateUser({ action: "set-role", userId: user.id, role: event.target.value })}
                    ><option value="user">User</option><option value="admin">Admin</option></select>
                  </td>
                  <td className="p-3 capitalize">{user.status}</td>
                  <td className="p-3">{formatDate(user.lastSignInAt)}</td>
                  <td className="p-3">
                    <button
                      className="rounded-md border border-border px-3 py-2 font-medium disabled:opacity-50"
                      disabled={busy || user.id === currentUserId}
                      onClick={() => updateUser({ action: user.status === "active" ? "disable" : "enable", userId: user.id })}
                    >{user.status === "active" ? "Disable" : "Enable"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="app-panel p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">Pending invitations</h2>
        {invitations.length === 0 ? <p className="mt-3 text-sm text-muted">No pending invitations.</p> : (
          <ul className="mt-4 divide-y divide-border">
            {invitations.map((invitation) => (
              <li className="flex items-center justify-between gap-4 py-3" key={invitation.id}>
                <div><div className="font-medium text-foreground">{invitation.email}</div><div className="text-sm capitalize text-muted">{invitation.role} · {invitation.status}</div></div>
                <span className="text-sm text-muted">{formatDate(invitation.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
