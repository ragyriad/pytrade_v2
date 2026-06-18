import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schemas/index_schema.js";

export type DB = PostgresJsDatabase<typeof schema>;