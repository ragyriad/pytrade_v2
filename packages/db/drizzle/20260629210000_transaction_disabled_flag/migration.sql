ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_is_disabled_idx" ON "transactions" ("is_disabled");
