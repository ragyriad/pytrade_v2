ALTER TABLE "dividend_events" RENAME TO "calendar_events";--> statement-breakpoint
ALTER TABLE "calendar_events" RENAME COLUMN "source" TO "provider_source";--> statement-breakpoint
ALTER TABLE "calendar_events" RENAME COLUMN "source_event_id" TO "provider_event_id";--> statement-breakpoint
ALTER TABLE "calendar_events" RENAME CONSTRAINT "dividend_events_pkey" TO "calendar_events_pkey";--> statement-breakpoint
ALTER TABLE "calendar_events" RENAME CONSTRAINT "dividend_events_security_id_securities_id_fkey" TO "calendar_events_security_id_securities_id_fkey";--> statement-breakpoint
DROP INDEX IF EXISTS "dividend_events_source_event_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dividend_events_security_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dividend_events_symbol_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dividend_events_provider_ticker_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "dividend_events_ex_date_idx";--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "event_type" varchar(50) DEFAULT 'dividend' NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "event_date" date;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "event_name" varchar(255);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "event_status" varchar(50);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "is_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "canonical_key" varchar(500);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "fiscal_date_ending" date;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "estimated_eps" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "reported_eps" numeric(18, 6);--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "cash_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "ex_date" DROP NOT NULL;--> statement-breakpoint
UPDATE "calendar_events"
SET
  "event_date" = "ex_date",
  "event_name" = 'Dividend',
  "canonical_key" =
    COALESCE("security_id"::text, upper("symbol")) ||
    ':dividend:' ||
    upper("ex_date"::text) ||
    ':' ||
    "cash_amount"::text ||
    ':' ||
    upper(COALESCE("currency_code", '-'));--> statement-breakpoint
DELETE FROM "calendar_events"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "canonical_key"
        ORDER BY "updated_at" DESC, "id"
      ) AS "duplicate_rank"
    FROM "calendar_events"
  ) AS "ranked_events"
  WHERE "duplicate_rank" > 1
);--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "event_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "calendar_events" ALTER COLUMN "canonical_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_provider_event_idx" ON "calendar_events" ("provider_source","provider_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_events_canonical_key_idx" ON "calendar_events" ("canonical_key");--> statement-breakpoint
CREATE INDEX "calendar_events_security_idx" ON "calendar_events" ("security_id");--> statement-breakpoint
CREATE INDEX "calendar_events_symbol_idx" ON "calendar_events" ("symbol");--> statement-breakpoint
CREATE INDEX "calendar_events_provider_ticker_idx" ON "calendar_events" ("provider_ticker");--> statement-breakpoint
CREATE INDEX "calendar_events_type_date_idx" ON "calendar_events" ("event_type","event_date");--> statement-breakpoint
CREATE INDEX "calendar_events_ex_date_idx" ON "calendar_events" ("ex_date");
