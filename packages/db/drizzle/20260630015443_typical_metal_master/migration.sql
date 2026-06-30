ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "is_disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "action" varchar(50);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "asset_type" varchar(50);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_action_idx" ON "transactions" ("action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_asset_type_idx" ON "transactions" ("asset_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_is_disabled_idx" ON "transactions" ("is_disabled");
