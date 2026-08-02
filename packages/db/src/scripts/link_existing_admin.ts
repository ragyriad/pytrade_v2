import { eq } from "drizzle-orm";
import { users } from "../schemas/users_schema.js";
import { closeDbConnection, db } from "../client.js";

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const clerkUserId = argument("clerk-user-id");
const username = argument("username") ?? "admin";
const email = argument("email")?.trim().toLowerCase();

if (!clerkUserId || !/^user_[A-Za-z0-9]+$/.test(clerkUserId)) {
  throw new Error(
    "Pass the Clerk user ID from your Clerk user page: --clerk-user-id=user_..."
  );
}

try {
  const existingRows = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const existingUser = existingRows[0];
  if (!existingUser) {
    throw new Error(`No existing PyTrade user named ${username} was found.`);
  }

  const updatedRows = await db
    .update(users)
    .set({
      clerkUserId,
      email: email ?? existingUser.email,
      role: "admin",
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(users.id, existingUser.id))
    .returning({ id: users.id, username: users.username });

  console.log(
    `Linked existing PyTrade user ${updatedRows[0].username} (${updatedRows[0].id}) to ${clerkUserId}.`
  );
  console.log("Existing accounts and financial records were not changed.");
} finally {
  await closeDbConnection();
}
