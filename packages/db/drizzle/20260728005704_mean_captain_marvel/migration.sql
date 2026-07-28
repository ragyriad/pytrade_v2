ALTER TABLE "securities" ADD COLUMN "listing_status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "delisted_at" date;--> statement-breakpoint
CREATE INDEX "securities_listing_status_idx" ON "securities" ("listing_status");