DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'option_contracts'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'options'
  ) THEN
    ALTER TABLE "option_contracts" RENAME TO "options";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'option_contract_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'option_id'
  ) THEN
    ALTER TABLE "transactions" RENAME COLUMN "option_contract_id" TO "option_id";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.option_contracts_security_idx') IS NOT NULL
    AND to_regclass('public.options_security_idx') IS NULL THEN
    ALTER INDEX "option_contracts_security_idx" RENAME TO "options_security_idx";
  END IF;

  IF to_regclass('public.option_contracts_ticker_idx') IS NOT NULL
    AND to_regclass('public.options_ticker_idx') IS NULL THEN
    ALTER INDEX "option_contracts_ticker_idx" RENAME TO "options_ticker_idx";
  END IF;

  IF to_regclass('public.option_contracts_underlying_idx') IS NOT NULL
    AND to_regclass('public.options_underlying_idx') IS NULL THEN
    ALTER INDEX "option_contracts_underlying_idx" RENAME TO "options_underlying_idx";
  END IF;

  IF to_regclass('public.option_contracts_status_idx') IS NOT NULL
    AND to_regclass('public.options_status_idx') IS NULL THEN
    ALTER INDEX "option_contracts_status_idx" RENAME TO "options_status_idx";
  END IF;

  IF to_regclass('public.option_contracts_expiration_idx') IS NOT NULL
    AND to_regclass('public.options_expiration_idx') IS NULL THEN
    ALTER INDEX "option_contracts_expiration_idx" RENAME TO "options_expiration_idx";
  END IF;

  IF to_regclass('public.transactions_option_contract_idx') IS NOT NULL
    AND to_regclass('public.transactions_option_idx') IS NULL THEN
    ALTER INDEX "transactions_option_contract_idx" RENAME TO "transactions_option_idx";
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'option_contracts_pkey')
    AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'options_pkey') THEN
    ALTER TABLE "options" RENAME CONSTRAINT "option_contracts_pkey" TO "options_pkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'option_contracts_security_id_securities_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'options_security_id_securities_id_fkey'
  ) THEN
    ALTER TABLE "options" RENAME CONSTRAINT
      "option_contracts_security_id_securities_id_fkey"
      TO "options_security_id_securities_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'option_contracts_underlying_security_id_securities_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'options_underlying_security_id_securities_id_fkey'
  ) THEN
    ALTER TABLE "options" RENAME CONSTRAINT
      "option_contracts_underlying_security_id_securities_id_fkey"
      TO "options_underlying_security_id_securities_id_fkey";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_option_contract_id_option_contracts_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_option_id_options_id_fkey'
  ) THEN
    ALTER TABLE "transactions" RENAME CONSTRAINT
      "transactions_option_contract_id_option_contracts_id_fkey"
      TO "transactions_option_id_options_id_fkey";
  END IF;
END $$;
