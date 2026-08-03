import "server-only";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { db, eq, users } from "@repo/db";

export type ApplicationRole = "admin" | "user";

export type ManagedUser = {
  key: string;
  clerkUserId: string | null;
  applicationUserId: string | null;
  username: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  imageUrl: string;
  role: ApplicationRole | null;
  applicationStatus: "pending" | "active" | "disabled" | null;
  clerkStatus: "active" | "disabled" | "missing";
  connection: "linked" | "clerk-only" | "application-only";
  lastSignInAt: number | null;
  createdAt: number;
};

export async function getCurrentApplicationUser() {
  const { userId } = await auth();
  if (!userId) return null;

  const localRows = await db
    .select()
    .from(users)
    .where(eq(users.clerkUserId, userId))
    .limit(1);
  return { userId, localUser: localRows[0] ?? null };
}

export async function requireApplicationAdmin() {
  const currentUser = await getCurrentApplicationUser();
  if (!currentUser) {
    return { ok: false as const, status: 401, error: "Authentication required." };
  }

  const { userId, localUser } = currentUser;
  if (!localUser || localUser.role !== "admin" || localUser.status !== "active") {
    return { ok: false as const, status: 403, error: "Administrator access required." };
  }

  const client = await clerkClient();
  return { ok: true as const, userId, localUser, client };
}

export async function listApplicationUsers(
  client: Awaited<ReturnType<typeof clerkClient>>
): Promise<{ users: ManagedUser[] }> {
  const localUsersPromise = db.select().from(users);
  const clerkUsers: Awaited<ReturnType<typeof client.users.getUserList>>["data"] = [];
  const pageSize = 100;
  let offset = 0;
  let totalCount = 0;

  do {
    const page = await client.users.getUserList({
      limit: pageSize,
      offset,
      orderBy: "-created_at",
    });
    clerkUsers.push(...page.data);
    totalCount = page.totalCount;
    offset += page.data.length;
    if (page.data.length === 0) break;
  } while (offset < totalCount);

  const localUsers = await localUsersPromise;

  const localByClerkId = new Map(
    localUsers
      .filter((user) => user.clerkUserId)
      .map((user) => [user.clerkUserId as string, user])
  );
  const matchedLocalIds = new Set<string>();
  const managedUsers: ManagedUser[] = clerkUsers.map((user) => {
    const localUser = localByClerkId.get(user.id) ?? null;
    if (localUser) matchedLocalIds.add(localUser.id);

    return {
      key: `clerk:${user.id}`,
      clerkUserId: user.id,
      applicationUserId: localUser?.id ?? null,
      username: user.username ?? localUser?.username ?? "No username",
      email: user.primaryEmailAddress?.emailAddress ?? localUser?.email ?? null,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      role: localUser?.role ?? null,
      applicationStatus: localUser?.status ?? null,
      clerkStatus: user.banned ? "disabled" : "active",
      connection: localUser ? "linked" : "clerk-only",
      lastSignInAt: user.lastSignInAt,
      createdAt: user.createdAt,
    };
  });

  for (const localUser of localUsers) {
    if (matchedLocalIds.has(localUser.id)) continue;
    managedUsers.push({
      key: `application:${localUser.id}`,
      clerkUserId: localUser.clerkUserId,
      applicationUserId: localUser.id,
      username: localUser.username,
      email: localUser.email,
      firstName: null,
      lastName: null,
      imageUrl: "",
      role: localUser.role,
      applicationStatus: localUser.status,
      clerkStatus: "missing",
      connection: "application-only",
      lastSignInAt: null,
      createdAt: localUser.createdAt.getTime(),
    });
  }

  return {
    users: managedUsers.sort((left, right) => right.createdAt - left.createdAt),
  };
}
