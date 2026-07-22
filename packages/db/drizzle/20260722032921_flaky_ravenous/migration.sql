CREATE TABLE "holdings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_id" uuid NOT NULL,
	"security_id" uuid,
	"underlying_security_id" uuid,
	"import_key" varchar(64) NOT NULL,
	"source" varchar(50) NOT NULL,
	"source_file" text NOT NULL,
	"source_page" integer NOT NULL,
	"as_of_date" date NOT NULL,
	"category" varchar(20) NOT NULL,
	"currency_code" varchar(10) NOT NULL,
	"option_type" varchar(10),
	"raw_symbol" varchar(100) NOT NULL,
	"symbol" varchar(100) NOT NULL,
	"description" text,
	"cost_basis" varchar(20),
	"quantity" numeric(24,2),
	"position_cost" numeric(24,2),
	"market_price" numeric(24,2),
	"market_value" numeric(24,2),
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_balances" ADD COLUMN "source" varchar(50) DEFAULT 'SNAPTRADE' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_balances" ADD COLUMN "source_file" text;--> statement-breakpoint
ALTER TABLE "account_balances" ADD COLUMN "as_of_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "holdings_import_key_idx" ON "holdings" ("import_key");--> statement-breakpoint
CREATE INDEX "holdings_account_date_idx" ON "holdings" ("account_id","as_of_date");--> statement-breakpoint
CREATE INDEX "historical_holdings_security_idx" ON "holdings" ("security_id");--> statement-breakpoint
CREATE INDEX "historical_holdings_underlying_security_idx" ON "holdings" ("underlying_security_id");--> statement-breakpoint
CREATE INDEX "historical_holdings_symbol_idx" ON "holdings" ("symbol");--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "holdings" ADD CONSTRAINT "holdings_underlying_security_id_securities_id_fkey" FOREIGN KEY ("underlying_security_id") REFERENCES "securities"("id") ON DELETE SET NULL;