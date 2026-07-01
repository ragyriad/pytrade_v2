ALTER TABLE "transactions" ADD COLUMN "is_legacy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_is_legacy_idx" ON "transactions" ("is_legacy");