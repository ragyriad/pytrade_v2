CREATE TABLE "account_balances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_id" uuid NOT NULL,
	"currency_code" varchar(10) NOT NULL,
	"cash" numeric(24,8),
	"buying_power" numeric(24,8),
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"account_id" uuid NOT NULL,
	"security_id" uuid,
	"brokerage_order_id" varchar(255) NOT NULL,
	"brokerage_group_order_id" varchar(255),
	"order_role" varchar(50),
	"status" varchar(40) NOT NULL,
	"action" varchar(40),
	"total_quantity" numeric(24,8),
	"open_quantity" numeric(24,8),
	"filled_quantity" numeric(24,8),
	"execution_price" numeric(24,8),
	"limit_price" numeric(24,8),
	"stop_price" numeric(24,8),
	"trailing_stop_amount" numeric(24,8),
	"trailing_stop_type" varchar(10),
	"quote_symbol" varchar(50),
	"order_type" varchar(50),
	"time_in_force" varchar(30),
	"time_placed" timestamp with time zone,
	"time_updated" timestamp with time zone,
	"time_executed" timestamp with time zone,
	"expiry_date" timestamp with time zone,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_balances_account_currency_idx" ON "account_balances" ("account_id","currency_code");--> statement-breakpoint
CREATE INDEX "account_balances_account_idx" ON "account_balances" ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_account_brokerage_order_idx" ON "orders" ("account_id","brokerage_order_id");--> statement-breakpoint
CREATE INDEX "orders_account_idx" ON "orders" ("account_id");--> statement-breakpoint
CREATE INDEX "orders_security_idx" ON "orders" ("security_id");--> statement-breakpoint
CREATE INDEX "orders_account_status_idx" ON "orders" ("account_id","status");--> statement-breakpoint
ALTER TABLE "account_balances" ADD CONSTRAINT "account_balances_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE SET NULL;