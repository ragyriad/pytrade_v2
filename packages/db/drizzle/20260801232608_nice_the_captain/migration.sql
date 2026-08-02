CREATE TYPE "user_status" AS ENUM('pending', 'active', 'disabled');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "clerk_user_id" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" varchar(320);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active'::"user_status" NOT NULL;--> statement-breakpoint
UPDATE "users" SET "role" = 'admin'::"role" WHERE "role" IS NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user'::"role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
DROP INDEX "users_clerk_user_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_idx" ON "users" ("clerk_user_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE("email");
