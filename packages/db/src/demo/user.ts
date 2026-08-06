import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DB } from "../client.js";
import { users } from "../schemas/index_schema.js";

export type DemoApplicationUser = {
  id: string;
  username: string;
  clerkUserId: string;
};

type EnsureDemoApplicationUserInput = {
  username: string;
  clerkUserId?: string;
  email?: string;
  dryRun: boolean;
};

function validateClerkUserId(value: string): string {
  if (!/^user_[A-Za-z0-9]+$/.test(value)) {
    throw new Error(
      "DEMO_CLERK_USER_ID must be the Clerk user ID from the Clerk Users page and start with user_."
    );
  }
  return value;
}

export async function ensureDemoApplicationUser(
  db: DB,
  input: EnsureDemoApplicationUserInput
): Promise<DemoApplicationUser> {
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.username, input.username))
    .limit(1);

  const configuredClerkUserId = input.clerkUserId?.trim();
  const clerkUserId = configuredClerkUserId
    ? validateClerkUserId(configuredClerkUserId)
    : existingUser?.clerkUserId
      ? validateClerkUserId(existingUser.clerkUserId)
      : null;

  if (!clerkUserId) {
    throw new Error(
      `Application user "${input.username}" is not linked to Clerk. Set DEMO_CLERK_USER_ID=user_... before running demo:seed.`
    );
  }

  const [clerkOwner] = await db
    .select({ id: users.id, username: users.username })
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  if (clerkOwner && clerkOwner.id !== existingUser?.id) {
    throw new Error(
      `Clerk identity ${clerkUserId} is already linked to application user "${clerkOwner.username}".`
    );
  }

  if (existingUser?.clerkUserId && existingUser.clerkUserId !== clerkUserId) {
    throw new Error(
      `Application user "${input.username}" is already linked to a different Clerk identity.`
    );
  }

  const email = input.email?.trim().toLowerCase() || existingUser?.email || null;
  if (email) {
    const [emailOwner] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (emailOwner && emailOwner.id !== existingUser?.id) {
      throw new Error(
        `Email ${email} is already assigned to application user "${emailOwner.username}".`
      );
    }
  }

  if (input.dryRun) {
    return {
      id: existingUser?.id ?? randomUUID(),
      username: input.username,
      clerkUserId,
    };
  }

  if (existingUser) {
    const [updated] = await db
      .update(users)
      .set({
        clerkUserId,
        email,
        status: "active",
        updatedAt: new Date(),
      })
      .where(eq(users.id, existingUser.id))
      .returning({
        id: users.id,
        username: users.username,
        clerkUserId: users.clerkUserId,
      });
    return updated as DemoApplicationUser;
  }

  const [created] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      username: input.username,
      clerkUserId,
      email,
      status: "active",
      role: "user",
    })
    .returning({
      id: users.id,
      username: users.username,
      clerkUserId: users.clerkUserId,
    });
  return created as DemoApplicationUser;
}
