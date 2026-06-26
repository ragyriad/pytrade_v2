CREATE TABLE "securities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"security_key" varchar(350) NOT NULL,
	"snaptrade_symbol_id" varchar(255),
	"symbol" varchar(50) NOT NULL,
	"raw_symbol" varchar(50),
	"description" text,
	"currency_code" varchar(10),
	"exchange_code" varchar(20),
	"exchange_mic_code" varchar(10),
	"exchange_name" varchar(255),
	"instrument_type_code" varchar(10),
	"instrument_type_description" varchar(100),
	"figi_code" varchar(20),
	"figi_instrument_code" varchar(20),
	"logo_url" varchar(500),
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "security_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "securities_security_key_idx" ON "securities" ("security_key");--> statement-breakpoint
CREATE INDEX "securities_snaptrade_symbol_idx" ON "securities" ("snaptrade_symbol_id");--> statement-breakpoint
CREATE INDEX "securities_symbol_idx" ON "securities" ("symbol");--> statement-breakpoint
CREATE INDEX "securities_figi_idx" ON "securities" ("figi_code");--> statement-breakpoint
CREATE INDEX "transactions_security_idx" ON "transactions" ("security_id");--> statement-breakpoint
CREATE INDEX "transactions_symbol_idx" ON "transactions" ("symbol");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE SET NULL;