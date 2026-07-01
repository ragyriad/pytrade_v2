ALTER TABLE "positions" ADD COLUMN "security_id" uuid;--> statement-breakpoint
UPDATE "positions" AS "position"
SET "security_id" = (
	SELECT "security"."id"
	FROM "securities" AS "security"
	WHERE
		(
			"position"."snaptrade_instrument_id" IS NOT NULL
			AND "security"."snaptrade_symbol_id" = "position"."snaptrade_instrument_id"
		)
		OR (
			"position"."figi_code" IS NOT NULL
			AND "security"."figi_code" = "position"."figi_code"
		)
		OR (
			"security"."symbol" = "position"."symbol"
			AND coalesce("security"."exchange_mic_code", "security"."exchange_code", '') =
				coalesce("position"."exchange_mic_code", "position"."exchange_code", '')
		)
		OR "security"."symbol" = "position"."symbol"
	ORDER BY
		CASE
			WHEN "position"."snaptrade_instrument_id" IS NOT NULL
				AND "security"."snaptrade_symbol_id" = "position"."snaptrade_instrument_id" THEN 1
			WHEN "position"."figi_code" IS NOT NULL
				AND "security"."figi_code" = "position"."figi_code" THEN 2
			WHEN "security"."symbol" = "position"."symbol"
				AND coalesce("security"."exchange_mic_code", "security"."exchange_code", '') =
					coalesce("position"."exchange_mic_code", "position"."exchange_code", '') THEN 3
			ELSE 4
		END
		,
		"security"."updated_at" DESC
	LIMIT 1
)
WHERE "position"."security_id" IS NULL;--> statement-breakpoint
CREATE INDEX "holdings_security_idx" ON "positions" ("security_id");--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_security_id_securities_id_fkey" FOREIGN KEY ("security_id") REFERENCES "securities"("id") ON DELETE SET NULL;
