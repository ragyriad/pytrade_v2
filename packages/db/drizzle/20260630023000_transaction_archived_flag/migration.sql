DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'is_disabled'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE "transactions" RENAME COLUMN "is_disabled" TO "is_archived";
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'is_disabled'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'is_archived'
  ) THEN
    UPDATE "transactions"
    SET "is_archived" = true
    WHERE "is_disabled" = true;

    ALTER TABLE "transactions" DROP COLUMN "is_disabled";
  ELSIF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'transactions'
      AND column_name = 'is_archived'
  ) THEN
    ALTER TABLE "transactions" ADD COLUMN "is_archived" boolean DEFAULT false NOT NULL;
  END IF;
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "transactions_is_disabled_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transactions_is_archived_idx" ON "transactions" ("is_archived");
