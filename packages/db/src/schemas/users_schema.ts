import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  index,
  uniqueIndex,
  pgEnum
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

/**
 * The userSecret must be treated as a credential — as sensitive as a password.
 * Do not return it from any API endpoint or log it anywhere.
 */

export const rolesEnum = pgEnum("role", [
  "admin",
  "user"
]);

export const userStatusEnum = pgEnum("user_status", [
  "pending",
  "active",
  "disabled"
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  username: varchar("username", { length: 64 })
    .notNull()
    .unique(),

  clerkUserId: varchar("clerk_user_id", { length: 255 }),
  email: varchar("email", { length: 320 }).unique(),
  status: userStatusEnum().notNull().default("active"),

  snaptradeUserId: varchar("snaptrade_user_id", { length: 255 }).unique(),
  snaptradeUserSecret: varchar("snaptrade_user_secret", { length: 255 }),
  role: rolesEnum().notNull().default("user"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .default(sql`now()`),
}, (table) => [
  uniqueIndex("users_clerk_user_id_idx").on(table.clerkUserId),

  index("users_snaptrade_user_id_idx").on(table.snaptradeUserId),
]);

/**
 * Safe user shape — excludes the SnapTrade secret.
 * Use this type whenever returning user data from an API endpoint.
 */
export type PublicUser = Omit<User, "snaptradeUserSecret">;
