CREATE TABLE "account_value_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_id" uuid NOT NULL,
	"value_date" date NOT NULL,
	"total_value" numeric(24,8) NOT NULL,
	"currency_code" varchar(10) NOT NULL,
	"source" varchar(50) DEFAULT 'SNAPTRADE' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_value_history_account_date_idx" ON "account_value_history" ("account_id","value_date");--> statement-breakpoint
CREATE INDEX "account_value_history_account_idx" ON "account_value_history" ("account_id");--> statement-breakpoint
CREATE INDEX "account_value_history_date_idx" ON "account_value_history" ("value_date");--> statement-breakpoint
ALTER TABLE "account_value_history" ADD CONSTRAINT "account_value_history_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;