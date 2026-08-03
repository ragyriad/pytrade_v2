import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db, eq, users } from "@repo/db";
import {
  listApplicationUsers,
  requireApplicationAdmin,
} from "../../../lib/clerkAdmin";

const createUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .transform((username) => username.toLowerCase()),
  password: z.string().min(1),
  email: z
    .union([z.literal(""), z.string().trim().email().max(320)])
    .default("")
    .transform((email) => email ? email.toLowerCase() : null),
  firstName: z.string().trim().max(64).default(""),
  lastName: z.string().trim().max(64).default(""),
  role: z.enum(["admin", "user"]).default("user"),
  requirePasswordReset: z.boolean().default(true),
});

const updateSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("disable"), userId: z.string().min(1) }),
  z.object({ action: z.literal("enable"), userId: z.string().min(1) }),
  z.object({
    action: z.literal("set-role"),
    userId: z.string().min(1),
    role: z.enum(["admin", "user"]),
  }),
]);

function clerkErrorMessage(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray(error.errors) &&
    typeof error.errors[0]?.longMessage === "string"
  ) {
    return error.errors[0].longMessage;
  }
  return error instanceof Error ? error.message : "Clerk request failed.";
}

export async function GET() {
  const authorization = await requireApplicationAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  return NextResponse.json(await listApplicationUsers(authorization.client));
}

export async function POST(request: Request) {
  const authorization = await requireApplicationAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }
  const client = authorization.client;

  const input = createUserSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: "Check the user information and try again.", issues: input.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  let existingUsernameId: string | undefined;
  let existingEmailId: string | undefined;
  try {
    const [matchingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.data.username))
      .limit(1);
    existingUsernameId = matchingUsername?.id;

    if (input.data.email) {
      const [matchingEmail] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.data.email))
        .limit(1);
      existingEmailId = matchingEmail?.id;
    }
  } catch {
    return NextResponse.json(
      { error: "PyTrade could not validate the local user information." },
      { status: 500 }
    );
  }

  if (existingUsernameId) {
    return NextResponse.json({ error: "That username is already in use." }, { status: 409 });
  }
  if (existingEmailId) {
    return NextResponse.json({ error: "That email address is already in use." }, { status: 409 });
  }

  const applicationUserId = randomUUID();
  let clerkUser: Awaited<ReturnType<typeof client.users.createUser>>;
  try {
    clerkUser = await client.users.createUser({
      username: input.data.username,
      password: input.data.password,
      skipPasswordChecks: true,
      emailAddress: input.data.email ? [input.data.email] : undefined,
      firstName: input.data.firstName || undefined,
      lastName: input.data.lastName || undefined,
      externalId: applicationUserId,
      publicMetadata: {
        role: input.data.role,
        applicationUserId,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: clerkErrorMessage(error) }, { status: 409 });
  }

  async function rollbackClerkUser(): Promise<boolean> {
    try {
      await client.users.deleteUser(clerkUser.id);
      return true;
    } catch {
      return false;
    }
  }

  if (input.data.requirePasswordReset) {
    try {
      await client.users.setPasswordCompromised(clerkUser.id, {
        revokeAllSessions: true,
      });
    } catch (error) {
      const rolledBack = await rollbackClerkUser();
      return NextResponse.json(
        rolledBack
          ? { error: clerkErrorMessage(error) }
          : {
              error: "Clerk created the user, but password-reset setup and rollback failed. Reconcile the Clerk user before retrying.",
              clerkUserId: clerkUser.id,
            },
        { status: rolledBack ? 502 : 500 }
      );
    }
  }

  try {
    await db.insert(users).values({
      id: applicationUserId,
      clerkUserId: clerkUser.id,
      email: input.data.email,
      username: input.data.username,
      role: input.data.role,
      status: "active",
    });
  } catch {
    const rolledBack = await rollbackClerkUser();
    return NextResponse.json(
      rolledBack
        ? { error: "PyTrade could not create the local account. The new Clerk user was rolled back." }
        : {
            error: "Clerk created the user, but PyTrade could not persist or roll it back. Reconcile the Clerk user before retrying.",
            clerkUserId: clerkUser.id,
          },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      applicationUserId,
      clerkUserId: clerkUser.id,
      message: "User created successfully in Clerk and PyTrade.",
    },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}

export async function PATCH(request: Request) {
  const authorization = await requireApplicationAdmin();
  if (!authorization.ok) {
    return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  }

  const input = updateSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Invalid user-management request." }, { status: 400 });
  }
  if (input.data.userId === authorization.userId && input.data.action === "disable") {
    return NextResponse.json({ error: "You cannot disable your own account." }, { status: 400 });
  }
  if (
    input.data.userId === authorization.userId &&
    input.data.action === "set-role" &&
    input.data.role !== "admin"
  ) {
    return NextResponse.json({ error: "You cannot remove your own admin role." }, { status: 400 });
  }

  try {
    const localRows = await db
      .select()
      .from(users)
      .where(eq(users.clerkUserId, input.data.userId))
      .limit(1);
    const localUser = localRows[0];
    if (!localUser) {
      return NextResponse.json({ error: "Application user not found." }, { status: 404 });
    }

    if (input.data.action === "disable") {
      await authorization.client.users.banUser(input.data.userId);
      await db
        .update(users)
        .set({ status: "disabled", updatedAt: new Date() })
        .where(eq(users.id, localUser.id));
    } else if (input.data.action === "enable") {
      await authorization.client.users.unbanUser(input.data.userId);
      await db
        .update(users)
        .set({ status: "active", updatedAt: new Date() })
        .where(eq(users.id, localUser.id));
    } else {
      await authorization.client.users.updateUserMetadata(input.data.userId, {
        publicMetadata: { role: input.data.role },
      });
      await db
        .update(users)
        .set({ role: input.data.role, updatedAt: new Date() })
        .where(eq(users.id, localUser.id));
    }
    return NextResponse.json({ success: true, message: "User updated successfully." });
  } catch (error) {
    return NextResponse.json({ error: clerkErrorMessage(error) }, { status: 400 });
  }
}
