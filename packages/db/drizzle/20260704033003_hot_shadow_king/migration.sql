CREATE TABLE "security_price_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"security_id" uuid NOT NULL,
	"source" varchar(50) NOT NULL,
	"provider_ticker" varchar(50) NOT NULL,
	"symbol" varchar(50) NOT NULL,
	"currency_code" varchar(10),
	"price_date" date NOT NULL,
	"open" numeric(18,6),
	"high" numeric(18,6),
	"low" numeric(18,6),
	"close" numeric(18,6) NOT NULL,
	"adjusted_close" numeric(18,6),
	"volume" numeric(24,6),
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "security_price_snapshots_source_ticker_date_idx" ON "security_price_snapshots" ("source","provider_ticker","price_date");--> statement-breakpoint
CREATE INDEX "security_price_snapshots_security_date_idx" ON "security_price_snapshots" ("security_id","price_date");--> statement-breakpoint
CREATE INDEX "security_price_snapshots_symbol_idx" ON "security_price_snapshots" ("symbol");--> statement-breakpoint
ALTER TABLE "security_price_snapshots" ADD CONSTRAINT "security_price_snapshots_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE CASCADE;