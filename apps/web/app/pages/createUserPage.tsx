"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { DismissibleAlert } from "../components/ui/dismissibleAlert";
import type { ApplicationRole } from "../lib/clerkAdmin";

type CreatedUser = {
  applicationUserId: string;
  clerkUserId: string;
  username: string;
  password: string;
  requirePasswordReset: boolean;
};

type CreateUserNotice = {
  message: string;
  tone: "success" | "error";
};

export function CreateUserPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<ApplicationRole>("user");
  const [requirePasswordReset, setRequirePasswordReset] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<CreateUserNotice | null>(null);
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [copied, setCopied] = useState(false);

  async function copyCredentials() {
    if (!createdUser) return;
    await navigator.clipboard.writeText(
      `Username: ${createdUser.username}\nPassword: ${createdUser.password}`
    );
    setCopied(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setCopied(false);

    if (password !== confirmPassword) {
      setNotice({ message: "The passwords do not match.", tone: "error" });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          email,
          firstName,
          lastName,
          password,
          role,
          requirePasswordReset,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Unable to create user.");

      setCreatedUser({
        applicationUserId: body.applicationUserId,
        clerkUserId: body.clerkUserId,
        username: username.trim().toLowerCase(),
        password,
        requirePasswordReset,
      });
      setNotice({
        message: body.message ?? "User created successfully in Clerk and PyTrade.",
        tone: "success",
      });
    } catch (caught) {
      setNotice({
        message: caught instanceof Error ? caught.message : "Unable to create user.",
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (createdUser) {
    return (
      <div className="grid gap-6">
        {notice ? (
          <DismissibleAlert
            message={notice.message}
            tone={notice.tone}
            onDismiss={() => setNotice(null)}
          />
        ) : null}
        <section className="app-panel p-5 sm:p-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-action">User created</p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">The Clerk and PyTrade accounts are linked.</h2>
          <p className="mt-2 text-sm text-muted">
            Copy the sign-in details now. PyTrade does not store the password and will not show it again.
          </p>

          <dl className="mt-5 grid gap-4 rounded-md border border-border bg-interactive-surface p-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-medium text-muted">Username</dt>
              <dd className="mt-1 break-all font-semibold text-foreground">{createdUser.username}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Password</dt>
              <dd className="mt-1 break-all font-mono text-foreground">{createdUser.password}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Clerk user ID</dt>
              <dd className="mt-1 break-all text-foreground">{createdUser.clerkUserId}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Application user ID</dt>
              <dd className="mt-1 break-all text-foreground">{createdUser.applicationUserId}</dd>
            </div>
          </dl>

          {createdUser.requirePasswordReset ? (
            <p className="mt-4 text-sm text-muted">
              Clerk will require this password to be replaced at the user&apos;s next sign-in.
            </p>
          ) : null}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-md bg-action-strong px-4 py-2 text-sm font-semibold text-on-action"
              onClick={copyCredentials}
            >
              {copied ? "Credentials copied" : "Copy credentials"}
            </button>
            <Link
              href="/admin/users"
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground"
            >
              Return to users
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <form className="grid gap-6" onSubmit={submit}>
      <section className="app-panel p-5 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
            Username
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              required
              maxLength={64}
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Up to 64 characters; Clerk username rules apply"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            First name
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              maxLength={64}
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Last name
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              maxLength={64}
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2">
            Email address <span className="font-normal text-muted">(optional)</span>
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              type="email"
              maxLength={320}
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="jane@example.com"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground sm:col-span-2 sm:max-w-xs">
            Application role
            <select
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              value={role}
              onChange={(event) => setRole(event.target.value as ApplicationRole)}
            >
              <option value="user">User</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Password
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Clerk password rules apply"
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-foreground">
            Confirm password
            <input
              className="h-11 rounded-md border border-border bg-surface px-3 font-normal"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Re-enter the password"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
            />
            Show password
          </label>
          <label className="flex items-center gap-2 text-sm text-foreground sm:col-span-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={requirePasswordReset}
              onChange={(event) => setRequirePasswordReset(event.target.checked)}
            />
            Require password change at next sign-in
          </label>
        </div>
      </section>

      {notice ? (
        <DismissibleAlert
          message={notice.message}
          tone={notice.tone}
          onDismiss={() => setNotice(null)}
        />
      ) : null}

      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link
          href="/admin/users"
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-5 py-2 text-sm font-semibold text-foreground"
        >
          Cancel
        </Link>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-action-strong px-5 py-2 text-sm font-semibold text-on-action disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Creating in Clerk and PyTrade..." : "Create user"}
        </button>
      </div>
    </form>
  );
}
