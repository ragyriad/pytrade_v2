ALTER TABLE "transactions" ADD COLUMN "source" varchar(50) DEFAULT 'SNAPTRADE' NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "external_transaction_id" varchar(255);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "legacy_import_key" varchar(500);--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "snaptrade_transaction_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "transactions_source_external_idx" ON "transactions" ("source","external_transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_legacy_import_key_idx" ON "transactions" ("legacy_import_key");