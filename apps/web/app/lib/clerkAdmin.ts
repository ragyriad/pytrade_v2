import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, eq, users } from "@repo/db";

export type ApplicationRole = "admin" | "user";

export type ManagedUser = {
  id: string;
  email: string;
  name: string;
  imageUrl: string;
  role: ApplicationRole;
  status: "active" | "disabled";
  lastSignInAt: number | null;
  createdAt: number;
};

export type ManagedInvitation = {
  id: string;
  email: string;
  role: ApplicationRole;
  status: string;
  createdAt: number;
};

function roleFromMetadata(metadata: Record<string, unknown>): ApplicationRole {
  return metadata.role === "admin" ? "admin" : "user";
}

export async function requireApplicationAdmin() {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }

  const client = await clerkClient();
  const localRows = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);
  const localUser = localRows[0];
  if (!localUser || localUser.role !== "admin" || localUser.status !== "active") {
    return { ok: false as const, status: 403, error: "Administrator access required." };
  }

  return { ok: true as const, userId, localUser, client };
}

export async function listApplicationUsers(
  client: Awaited<ReturnType<typeof clerkClient>>
): Promise<{
  users: ManagedUser[];
  invitations: ManagedInvitation[];
}> {
  const [userList, invitationList, localUsers] = await Promise.all([
    client.users.getUserList({ limit: 100, orderBy: "-created_at" }),
    client.invitations.getInvitationList({
      limit: 100,
      status: "pending",
      orderBy: "-created_at",
    }),
    db.select().from(users),
  ]);

  const localByClerkId = new Map(
    localUsers
      .filter((user) => user.clerkUserId)
      .map((user) => [user.clerkUserId as string, user])
  );
  const localByEmail = new Map(
    localUsers
      .filter((user) => user.email)
      .map((user) => [user.email as string, user])
  );

  return {
    users: userList.data.flatMap((user) => {
      const localUser = localByClerkId.get(user.id);
      if (!localUser) return [];
      return [{
        id: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? localUser.email ?? "No email",
        name: user.fullName ?? localUser.username,
        imageUrl: user.imageUrl,
        role: localUser.role,
        status: localUser.status === "disabled" || user.banned ? "disabled" as const : "active" as const,
        lastSignInAt: user.lastSignInAt,
        createdAt: user.createdAt,
      }];
    }),
    invitations: invitationList.data.map((invitation) => ({
      id: invitation.id,
      email: invitation.emailAddress,
      role: localByEmail.get(invitation.emailAddress.toLowerCase())?.role
        ?? roleFromMetadata(invitation.publicMetadata ?? {}),
      status: invitation.status,
      createdAt: invitation.createdAt,
    })),
  };
}
