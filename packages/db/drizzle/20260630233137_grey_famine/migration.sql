CREATE TABLE "option_contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"security_id" uuid NOT NULL,
	"underlying_security_id" uuid NOT NULL,
	"ticker" varchar(80) NOT NULL,
	"contract_type" varchar(10) NOT NULL,
	"strike_price" numeric(18,6) NOT NULL,
	"expiration_date" date NOT NULL,
	"multiplier" numeric(10,2) DEFAULT '100' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"is_mini_option" boolean DEFAULT false NOT NULL,
	"raw_data" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "underlying_security_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "option_contract_id" uuid;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "option_action" varchar(50);--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "raw_data" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "option_contracts_security_idx" ON "option_contracts" ("security_id");--> statement-breakpoint
CREATE UNIQUE INDEX "option_contracts_ticker_idx" ON "option_contracts" ("ticker");--> statement-breakpoint
CREATE INDEX "option_contracts_underlying_idx" ON "option_contracts" ("underlying_security_id");--> statement-breakpoint
CREATE INDEX "option_contracts_status_idx" ON "option_contracts" ("status");--> statement-breakpoint
CREATE INDEX "option_contracts_expiration_idx" ON "option_contracts" ("expiration_date");--> statement-breakpoint
CREATE INDEX "transactions_underlying_security_idx" ON "transactions" ("underlying_security_id");--> statement-breakpoint
CREATE INDEX "transactions_option_contract_idx" ON "transactions" ("option_contract_id");--> statement-breakpoint
ALTER TABLE "option_contracts" ADD CONSTRAINT "option_contracts_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "option_contracts" ADD CONSTRAINT "option_contracts_underlying_security_id_securities_id_fkey" FOREIGN KEY ("underlying_security_id") REFERENCES "securities"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_underlying_security_id_securities_id_fkey" FOREIGN KEY ("underlying_security_id") REFERENCES "securities"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_option_contract_id_option_contracts_id_fkey" FOREIGN KEY ("option_contract_id") REFERENCES "option_contracts"("id") ON DELETE SET NULL;