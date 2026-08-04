"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DismissibleAlert } from "../components/ui/dismissibleAlert";
import type { ReactNode } from "react";
import type { ManagedUser } from "../lib/clerkAdmin";
import { useSessionState } from "../state/sessionState";
import { queryKeys } from "../state/queryKeys";

type UserPageProps = {
  initialUsers: ManagedUser[];
  currentUserId: string;
};

type UserNotice = {
  message: string;
  tone: "success" | "error";
};

function formatDate(value: number | null): string {
  return value == null
    ? "Never"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(value);
}

function displayName(user: ManagedUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username;
}

function connectionLabel(connection: ManagedUser["connection"]): string {
  if (connection === "clerk-only") return "Clerk only";
  if (connection === "application-only") return "Application only";
  return "Linked";
}

function StatusPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-border bg-interactive-surface px-2.5 py-1 text-xs font-semibold capitalize text-foreground">
      {children}
    </span>
  );
}

async function fetchAdminUsers(): Promise<ManagedUser[]> {
  const response = await fetch("/api/admin/users", { cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to refresh users.");
  return body.users as ManagedUser[];
}

async function patchAdminUser({
  payload,
  userId,
}: {
  payload: Record<string, string>;
  userId: string;
}): Promise<{ message?: string }> {
  const response = await fetch("/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, userId }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Unable to update user.");
  return body;
}

export function UserPage({ initialUsers, currentUserId }: UserPageProps) {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: queryKeys.adminUsers,
    queryFn: fetchAdminUsers,
    initialData: initialUsers,
    meta: { persist: false },
    staleTime: 60_000,
  });
  const users: ManagedUser[] = usersQuery.data;
  const [query, setQuery] = useSessionState("admin-users:search", "");
  const [notice, setNotice] = useState<UserNotice | null>(null);
  const updateUserMutation = useMutation({
    mutationFn: patchAdminUser,
    onSuccess: async (body: { message?: string }) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.adminUsers });
      setNotice({
        message: body.message ?? "User updated successfully.",
        tone: "success",
      });
    },
    onError: (error: unknown) => {
      setNotice({
        message: error instanceof Error ? error.message : "Unable to update user.",
        tone: "error",
      });
    },
  });
  const busyUserId = updateUserMutation.isPending
    ? updateUserMutation.variables?.userId ?? null
    : null;

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return users;
    return users.filter((user) =>
      [user.username, user.email, user.firstName, user.lastName, user.clerkUserId]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedQuery))
    );
  }, [query, users]);

  const linkedCount = users.filter((user) => user.connection === "linked").length;
  const attentionCount = users.length - linkedCount;

  function updateUser(userId: string, payload: Record<string, string>) {
    setNotice(null);
    updateUserMutation.mutate({ payload, userId });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="app-panel p-4 sm:p-5">
          <p className="text-sm text-muted">Total identities</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{users.length}</p>
        </div>
        <div className="app-panel p-4 sm:p-5">
          <p className="text-sm text-muted">Linked accounts</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{linkedCount}</p>
        </div>
        <div className="app-panel p-4 sm:p-5">
          <p className="text-sm text-muted">Needs attention</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{attentionCount}</p>
        </div>
      </section>

      <div className="flex justify-start sm:justify-start">
        <Link
          href="/admin/users/new"
          className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-action-strong px-4 py-2 text-sm font-semibold text-on-action sm:w-auto"
        >
          Add user
        </Link>
      </div>

      <section className="app-panel overflow-hidden">
        <div className="border-b border-border p-4 sm:px-6">
          <label className="grid max-w-md gap-1.5 text-sm font-medium text-foreground">
            Search users
            <input
              type="search"
              className="h-10 rounded-md border border-border bg-surface px-3 font-normal"
              placeholder="Name, username, email, or Clerk ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          {notice ? (
            <div className="mt-4">
              <DismissibleAlert
                message={notice.message}
                tone={notice.tone}
                onDismiss={() => setNotice(null)}
              />
            </div>
          ) : null}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-border bg-interactive-surface text-muted">
              <tr>
                <th className="p-3">User</th>
                <th className="p-3">Connection</th>
                <th className="p-3">Role</th>
                <th className="p-3">Application</th>
                <th className="p-3">Clerk</th>
                <th className="p-3">Last sign-in</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isCurrentUser = user.clerkUserId === currentUserId;
                const canManage = user.connection === "linked" && Boolean(user.clerkUserId);
                const isBusy = busyUserId === user.clerkUserId;
                const isActive = user.applicationStatus === "active" && user.clerkStatus === "active";
                return (
                  <tr className="border-b border-border align-top last:border-0" key={user.key}>
                    <td className="p-3">
                      <div className="font-medium text-foreground">
                        {displayName(user)}{isCurrentUser ? " (you)" : ""}
                      </div>
                      <div className="text-muted">@{user.username}</div>
                      <div className="text-muted">{user.email ?? "No email"}</div>
                    </td>
                    <td className="p-3"><StatusPill>{connectionLabel(user.connection)}</StatusPill></td>
                    <td className="p-3">
                      {canManage && user.role ? (
                        <select
                          aria-label={`Role for ${user.username}`}
                          className="h-9 rounded-md border border-border bg-surface px-2"
                          disabled={isBusy || isCurrentUser}
                          value={user.role}
                          onChange={(event) => updateUser(user.clerkUserId!, {
                            action: "set-role",
                            role: event.target.value,
                          })}
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : <span className="text-muted">Not assigned</span>}
                    </td>
                    <td className="p-3"><StatusPill>{user.applicationStatus ?? "Missing"}</StatusPill></td>
                    <td className="p-3"><StatusPill>{user.clerkStatus}</StatusPill></td>
                    <td className="p-3 text-muted">{formatDate(user.lastSignInAt)}</td>
                    <td className="p-3">
                      <button
                        className="rounded-md border border-border px-3 py-2 font-medium text-foreground disabled:opacity-50"
                        disabled={!canManage || isBusy || isCurrentUser}
                        onClick={() => updateUser(user.clerkUserId!, {
                          action: isActive ? "disable" : "enable",
                        })}
                      >
                        {isBusy ? "Updating..." : isActive ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-border md:hidden">
          {filteredUsers.map((user) => {
            const isCurrentUser = user.clerkUserId === currentUserId;
            const canManage = user.connection === "linked" && Boolean(user.clerkUserId);
            const isBusy = busyUserId === user.clerkUserId;
            const isActive = user.applicationStatus === "active" && user.clerkStatus === "active";
            return (
              <li className="grid gap-4 p-4" key={user.key}>
                <div>
                  <div className="font-medium text-foreground">
                    {displayName(user)}{isCurrentUser ? " (you)" : ""}
                  </div>
                  <div className="text-sm text-muted">@{user.username}</div>
                  <div className="break-all text-sm text-muted">{user.email ?? "No email"}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <StatusPill>{connectionLabel(user.connection)}</StatusPill>
                  <StatusPill>App: {user.applicationStatus ?? "missing"}</StatusPill>
                  <StatusPill>Clerk: {user.clerkStatus}</StatusPill>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="grid gap-1 text-xs font-medium text-muted">
                    Role
                    <select
                      aria-label={`Mobile role for ${user.username}`}
                      className="h-10 rounded-md border border-border bg-surface px-2 text-sm text-foreground"
                      disabled={!canManage || isBusy || isCurrentUser || !user.role}
                      value={user.role ?? "user"}
                      onChange={(event) => updateUser(user.clerkUserId!, {
                        action: "set-role",
                        role: event.target.value,
                      })}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </label>
                  <button
                    className="self-end rounded-md border border-border px-3 py-2 font-medium text-foreground disabled:opacity-50"
                    disabled={!canManage || isBusy || isCurrentUser}
                    onClick={() => updateUser(user.clerkUserId!, {
                      action: isActive ? "disable" : "enable",
                    })}
                  >
                    {isBusy ? "Updating..." : isActive ? "Disable" : "Enable"}
                  </button>
                </div>
                <p className="text-xs text-muted">Last sign-in: {formatDate(user.lastSignInAt)}</p>
              </li>
            );
          })}
        </ul>

        {filteredUsers.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted">No users match your search.</p>
        ) : null}
      </section>
    </div>
  );
}
