import { createClerkClient } from "@clerk/backend";
import { db, eq, users, type User } from "@repo/db";

export type ApplicationUserResolution =
  | { ok: true; user: User }
  | { ok: false; reason: "not-provisioned" | "disabled" };

function applicationUserIdFromMetadata(metadata: Record<string, unknown>): string | null {
  const value = metadata.applicationUserId;
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function resolveApplicationUser(
  clerkUserId: string,
  clerkSecretKey: string
): Promise<ApplicationUserResolution> {
  const linkedRows = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, clerkUserId))
    .limit(1);
  const linkedUser = linkedRows[0];

  if (linkedUser) {
    return linkedUser.status === "disabled"
      ? { ok: false, reason: "disabled" }
      : { ok: true, user: linkedUser };
  }

  // Invitations create a pending local owner first and put its UUID in Clerk's
  // signed public metadata. A verified primary email remains a compatibility
  // fallback for invitations issued before that metadata existed.
  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const clerkUser = await clerk.users.getUser(clerkUserId);
  const applicationUserId = applicationUserIdFromMetadata(clerkUser.publicMetadata);
  const email = clerkUser.primaryEmailAddress?.emailAddress.trim().toLowerCase();
  if (!applicationUserId && !email) return { ok: false, reason: "not-provisioned" };

  const pendingRows = await db
    .select()
    .from(users)
    .where(
      applicationUserId
        ? eq(users.id, applicationUserId)
        : eq(users.email, email as string)
    )
    .limit(1);
  const pendingUser = pendingRows[0];
  if (!pendingUser || pendingUser.status !== "pending") {
    return { ok: false, reason: "not-provisioned" };
  }

  const linkedRowsAfterUpdate = await db
    .update(users)
    .set({
      clerkUserId,
      email: email ?? pendingUser.email,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(users.id, pendingUser.id))
    .returning();

  const linkedUserAfterUpdate = linkedRowsAfterUpdate[0];
  return linkedUserAfterUpdate
    ? { ok: true, user: linkedUserAfterUpdate }
    : { ok: false, reason: "not-provisioned" };
}
