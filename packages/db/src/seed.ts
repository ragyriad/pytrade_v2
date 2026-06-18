import { DB } from "./client.js"; 
import { users } from "./schemas/index_schema.js"
import { eq } from "drizzle-orm";

const ADMIN_ID = "00000000-0000-0000-0000-000000000001";

export async function createSeed(db: DB) {
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, ADMIN_ID))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [admin] = await db
    .insert(users)
    .values({
      id: ADMIN_ID,
      username: "admin",
    })
    .returning();

  return admin;
}