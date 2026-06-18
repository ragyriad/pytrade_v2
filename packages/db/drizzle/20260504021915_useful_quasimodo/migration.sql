CREATE TYPE "role" AS ENUM('admin', 'user');--> statement-breakpoint
CREATE TYPE "status" AS ENUM('active', 'inactive', 'deactivated', 'error', 'open', 'closed');--> statement-breakpoint
CREATE TYPE "type" AS ENUM('BUY', 'SELL', 'DIVIDEND', 'INTEREST', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'OTHER', 'CONTRIBUTION', 'P2P_PAYMENT');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"user_id" uuid NOT NULL,
	"snaptrade_account_id" uuid UNIQUE,
	"brokerage_authorization" varchar(255),
	"brokerage_account_number" varchar(255) UNIQUE,
	"brokerage_name" varchar(255),
	"account_currency" varchar(10),
	"status" "status" DEFAULT 'active'::"status",
	"type" varchar(100),
	"name" varchar(255),
	"is_paper" boolean DEFAULT false,
	"linked_account_id" varchar(255),
	"balance_amount" numeric(18,2),
	"balance_currency" varchar(10),
	"first_transaction_date" timestamp with time zone,
	"last_transactions_sync_at" timestamp with time zone,
	"last_holdings_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"snaptrade_transaction_id" varchar(36) NOT NULL UNIQUE,
	"account_id" uuid NOT NULL,
	"type" "type" NOT NULL,
	"description" text,
	"amount" numeric(18,2) NOT NULL,
	"price" numeric(18,6),
	"units" numeric(18,6),
	"fee" numeric(10,4) DEFAULT '0' NOT NULL,
	"currency_code" varchar(3),
	"symbol" varchar(20),
	"trade_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"username" varchar(64) NOT NULL UNIQUE,
	"snaptrade_user_id" varchar(255) UNIQUE,
	"snaptrade_user_secret" varchar(255),
	"role" "role" DEFAULT 'admin'::"role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "brokerage_account_number_idx" ON "accounts" ("brokerage_account_number");--> statement-breakpoint
CREATE INDEX "linked_account_idx" ON "accounts" ("linked_account_id");--> statement-breakpoint
CREATE INDEX "account_type_idx" ON "accounts" ("type");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" ("account_id");--> statement-breakpoint
CREATE INDEX "transactions_trade_date_idx" ON "transactions" ("trade_date");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_user_id_idx" ON "users" ("username");--> statement-breakpoint
CREATE INDEX "users_snaptrade_user_id_idx" ON "users" ("snaptrade_user_id");--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_accounts_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE CASCADE;