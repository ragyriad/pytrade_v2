-- Replace the enum-backed manual classification with free-form strings.
-- Existing classification values are retained by casting the enum to text.
ALTER TABLE "accounts"
  ALTER COLUMN "type" TYPE varchar(100) USING "type"::text;

-- SnapTrade's unified account type is provider data and keeps its original name.
ALTER TABLE "accounts" RENAME COLUMN "snaptrade_sub_type" TO "snaptrade_unified_account_type";

-- Optional user-managed distinction, populated separately from provider sync.
ALTER TABLE "accounts" ADD COLUMN "management" varchar(100);

DROP TYPE IF EXISTS "account_type";
