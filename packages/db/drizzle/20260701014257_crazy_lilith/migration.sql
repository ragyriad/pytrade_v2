DROP INDEX "transactions_is_legacy_idx";--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "source" varchar(50) DEFAULT 'SNAPTRADE' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" DROP COLUMN "is_legacy";--> statement-breakpoint
CREATE INDEX "securities_source_idx" ON "securities" ("source");