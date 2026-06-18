CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_id" uuid NOT NULL,
	"snaptrade_symbol_id" varchar(255),
	"snaptrade_instrument_id" varchar(255),
	"symbol" varchar(50) NOT NULL,
	"description" text,
	"raw_symbol" varchar(50),
	"exchange_code" varchar(20),
	"exchange_mic_code" varchar(10),
	"exchange_name" varchar(255),
	"units" numeric(18,6) NOT NULL,
	"fractional_units" numeric(18,6),
	"price" numeric(18,6),
	"average_purchase_price" numeric(18,6),
	"open_pnl" numeric(18,6),
	"currency_code" varchar(10),
	"cash_equivalent" boolean DEFAULT false,
	"is_quotable" boolean DEFAULT false,
	"is_tradable" boolean DEFAULT false,
	"instrument_type_code" varchar(10),
	"instrument_type_description" varchar(100),
	"figi_code" varchar(20),
	"figi_instrument_code" varchar(20),
	"logo_url" varchar(500),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "holdings_account_idx" ON "positions" ("account_id");--> statement-breakpoint
CREATE INDEX "holdings_account_symbol_idx" ON "positions" ("account_id","symbol");--> statement-breakpoint
CREATE INDEX "holdings_symbol_idx" ON "positions" ("symbol");--> statement-breakpoint
CREATE INDEX "holdings_figi_idx" ON "positions" ("figi_code");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;