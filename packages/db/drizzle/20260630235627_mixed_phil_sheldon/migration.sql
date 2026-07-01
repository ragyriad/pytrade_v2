ALTER TABLE "accounts" ADD COLUMN "raw_type" varchar(100);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "snaptrade_meta_type" varchar(100);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "snaptrade_unified_account_type" varchar(100);--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "raw_data" jsonb;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "funding_date" timestamp with time zone;