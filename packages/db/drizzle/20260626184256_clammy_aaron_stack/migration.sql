CREATE TABLE "security_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"security_id" uuid NOT NULL,
	"source" varchar(100) NOT NULL,
	"external_id" varchar(255),
	"symbol" varchar(50) NOT NULL,
	"raw_symbol" varchar(50),
	"currency_code" varchar(10),
	"exchange_code" varchar(20),
	"exchange_mic_code" varchar(10),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "security_aliases_source_external_idx" ON "security_aliases" ("source","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "security_aliases_source_symbol_idx" ON "security_aliases" ("source","symbol","currency_code","exchange_code");--> statement-breakpoint
CREATE INDEX "security_aliases_security_idx" ON "security_aliases" ("security_id");--> statement-breakpoint
CREATE INDEX "security_aliases_symbol_idx" ON "security_aliases" ("symbol");--> statement-breakpoint
ALTER TABLE "security_aliases" ADD CONSTRAINT "security_aliases_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE CASCADE;