ALTER TABLE "accounts" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "options" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "securities" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "security_aliases" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "accounts_is_archived_idx" ON "accounts" ("is_archived");--> statement-breakpoint
CREATE INDEX "options_is_archived_idx" ON "options" ("is_archived");--> statement-breakpoint
CREATE INDEX "securities_is_archived_idx" ON "securities" ("is_archived");--> statement-breakpoint
CREATE INDEX "security_aliases_is_archived_idx" ON "security_aliases" ("is_archived");
--> statement-breakpoint
UPDATE "transactions"
SET "is_archived" = true
WHERE lower(trim("source")) IN ('questrade legacy', 'legacy_sqlite');
--> statement-breakpoint
UPDATE "security_aliases"
SET "is_archived" = true
WHERE lower(trim("source")) IN ('questrade legacy', 'legacy_sqlite');
--> statement-breakpoint
UPDATE "options" AS "option"
SET "is_archived" = true
WHERE lower(trim(COALESCE("option"."raw_data" ->> 'source', ''))) IN (
  'questrade legacy',
  'legacy_sqlite'
)
AND NOT EXISTS (
  SELECT 1
  FROM "transactions" AS "transaction"
  WHERE "transaction"."option_id" = "option"."id"
    AND "transaction"."is_archived" = false
);
--> statement-breakpoint
UPDATE "securities" AS "security"
SET "is_archived" = true
WHERE lower(trim("security"."source")) IN ('questrade legacy', 'legacy_sqlite')
AND NOT EXISTS (
  SELECT 1
  FROM "transactions" AS "transaction"
  WHERE (
    "transaction"."security_id" = "security"."id"
    OR "transaction"."underlying_security_id" = "security"."id"
  )
  AND "transaction"."is_archived" = false
)
AND NOT EXISTS (
  SELECT 1
  FROM "positions" AS "position"
  WHERE "position"."security_id" = "security"."id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "holdings" AS "holding"
  WHERE "holding"."security_id" = "security"."id"
    OR "holding"."underlying_security_id" = "security"."id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "options" AS "option"
  WHERE (
    "option"."security_id" = "security"."id"
    OR "option"."underlying_security_id" = "security"."id"
  )
  AND "option"."is_archived" = false
)
AND NOT EXISTS (
  SELECT 1
  FROM "dividend_events" AS "dividend"
  WHERE "dividend"."security_id" = "security"."id"
)
AND NOT EXISTS (
  SELECT 1
  FROM "security_price_snapshots" AS "price"
  WHERE "price"."security_id" = "security"."id"
);
--> statement-breakpoint
UPDATE "accounts" AS "account"
SET "is_archived" = true
WHERE EXISTS (
  SELECT 1
  FROM "transactions" AS "legacy_transaction"
  WHERE "legacy_transaction"."account_id" = "account"."id"
    AND lower(trim("legacy_transaction"."source")) IN (
      'questrade legacy',
      'legacy_sqlite'
    )
)
AND NOT EXISTS (
  SELECT 1
  FROM "transactions" AS "active_transaction"
  WHERE "active_transaction"."account_id" = "account"."id"
    AND "active_transaction"."is_archived" = false
)
AND NOT EXISTS (
  SELECT 1 FROM "positions" AS "position"
  WHERE "position"."account_id" = "account"."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "holdings" AS "holding"
  WHERE "holding"."account_id" = "account"."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "account_balances" AS "balance"
  WHERE "balance"."account_id" = "account"."id"
)
AND NOT EXISTS (
  SELECT 1 FROM "orders" AS "order"
  WHERE "order"."account_id" = "account"."id"
);
