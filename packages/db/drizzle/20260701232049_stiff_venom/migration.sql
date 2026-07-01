CREATE TABLE "dividend_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"security_id" uuid,
	"source" varchar(50) NOT NULL,
	"source_event_id" varchar(255) NOT NULL,
	"provider_ticker" varchar(50) NOT NULL,
	"symbol" varchar(50) NOT NULL,
	"currency_code" varchar(10),
	"cash_amount" numeric(18,6) NOT NULL,
	"ex_date" date NOT NULL,
	"payment_date" date,
	"record_date" date,
	"declaration_date" date,
	"frequency" varchar(20),
	"distribution_type" varchar(50),
	"is_special" boolean DEFAULT false NOT NULL,
	"raw_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dividend_events_source_event_idx" ON "dividend_events" ("source","source_event_id");--> statement-breakpoint
CREATE INDEX "dividend_events_security_idx" ON "dividend_events" ("security_id");--> statement-breakpoint
CREATE INDEX "dividend_events_symbol_idx" ON "dividend_events" ("symbol");--> statement-breakpoint
CREATE INDEX "dividend_events_provider_ticker_idx" ON "dividend_events" ("provider_ticker");--> statement-breakpoint
CREATE INDEX "dividend_events_ex_date_idx" ON "dividend_events" ("ex_date");--> statement-breakpoint
ALTER TABLE "dividend_events" ADD CONSTRAINT "dividend_events_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE SET NULL;