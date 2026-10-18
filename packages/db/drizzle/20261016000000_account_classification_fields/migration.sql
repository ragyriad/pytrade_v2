-- Keep the existing provider classification values intact under subtype fields.
ALTER TABLE "accounts" RENAME COLUMN "type" TO "sub_type";
ALTER TABLE "accounts" RENAME COLUMN "snaptrade_unified_account_type" TO "snaptrade_sub_type";
ALTER INDEX "account_type_idx" RENAME TO "account_sub_type_idx";

-- Classification is intentionally nullable so existing rows remain unchanged
-- until they are manually assigned Managed_Investment, Self_Investment, or Expenses.
CREATE TYPE "account_type" AS ENUM ('Managed_Investment', 'Self_Investment', 'Expenses');
ALTER TABLE "accounts" ADD COLUMN "type" "account_type";
CREATE INDEX "account_type_idx" ON "accounts" ("type");
