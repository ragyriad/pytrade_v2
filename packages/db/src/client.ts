import { drizzle, PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as dotenv from "dotenv";
import { getWorkspaceParentEnvPath } from "./env.js";
import * as schema from "./schemas/index_schema.js";

dotenv.config({ path: getWorkspaceParentEnvPath() });

const connectionString = process.env.DATABASE_URL!;
export const db = drizzle(connectionString, { schema: schema });

export async function checkDbConnection() {
  await db.execute("select 1");
}

export async function closeDbConnection() {
  const client = (db as typeof db & { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}

export type DB = PostgresJsDatabase<typeof schema>;

