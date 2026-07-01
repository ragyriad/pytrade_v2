import { sql } from "drizzle-orm";
import { DB } from "../db_type.js";
import {
  options,
  type NewOption,
  type Option,
} from "../schemas/options_schema.js";

export async function upsertOptions(
  db: DB,
  data: NewOption[]
): Promise<Option[]> {
  if (data.length === 0) return [];

  return db
    .insert(options)
    .values(data)
    .onConflictDoUpdate({
      target: [options.ticker],
      set: {
        securityId: sql`excluded.security_id`,
        underlyingSecurityId: sql`excluded.underlying_security_id`,
        contractType: sql`excluded.contract_type`,
        strikePrice: sql`excluded.strike_price`,
        expirationDate: sql`excluded.expiration_date`,
        multiplier: sql`excluded.multiplier`,
        status: sql`excluded.status`,
        isMiniOption: sql`excluded.is_mini_option`,
        rawData: sql`excluded.raw_data`,
        firstSeenAt: sql`least(${options.firstSeenAt}, excluded.first_seen_at)`,
        lastSeenAt: sql`greatest(${options.lastSeenAt}, excluded.last_seen_at)`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}
