CREATE TABLE "forex_rate_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"source" varchar(50) NOT NULL,
	"provider_ticker" varchar(50) NOT NULL,
	"base_currency" varchar(10) NOT NULL,
	"quote_currency" varchar(10) NOT NULL,
	"rate_date" date NOT NULL,
	"open" numeric(18,8),
	"high" numeric(18,8),
	"low" numeric(18,8),
	"close" numeric(18,8) NOT NULL,
	"adjusted_close" numeric(18,8),
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "forex_rate_snapshots_source_ticker_date_idx" ON "forex_rate_snapshots" ("source","provider_ticker","rate_date");--> statement-breakpoint
CREATE INDEX "forex_rate_snapshots_pair_date_idx" ON "forex_rate_snapshots" ("base_currency","quote_currency","rate_date");