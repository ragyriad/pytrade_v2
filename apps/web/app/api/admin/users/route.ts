import { NextResponse } from "next/server";
import { z } from "zod";
import { db, eq, users } from "@repo/db";
import {
  listApplicationUsers,
  requireApplicationAdmin,
} from "../../../lib/clerkAdmin";

const inviteSchema = z.object({
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  username: z.string().trim().min(1).max(64),
  role: z.enum(["admin", "user"]).default("user"),
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

  const input = inviteSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json(
      { error: "Enter a valid email and role.", issues: input.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
    const insertedRows = await db
      .insert(users)
      .values({
        email: input.data.email,
        username: input.data.username,
        role: input.data.role,
        status: "pending",
      })
      .returning({ id: users.id });
    const localUserId = insertedRows[0].id;

    let invitation;
    try {
      invitation = await authorization.client.invitations.createInvitation({
        emailAddress: input.data.email,
        redirectUrl: `${appUrl}/sign-up`,
        publicMetadata: {
          role: input.data.role,
          applicationUserId: localUserId,
        },
        notify: true,
      });
    } catch (error) {
      await db.delete(users).where(eq(users.id, localUserId));
      throw error;
    }
    return NextResponse.json({ id: invitation.id }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: clerkErrorMessage(error) }, { status: 409 });
  }
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
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: clerkErrorMessage(error) }, { status: 400 });
  }
}
