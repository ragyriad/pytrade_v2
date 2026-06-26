import { sql } from "drizzle-orm";
import { DB } from "../db_type.js";
import {
  securityAliases,
  SecurityAlias,
  NewSecurityAlias,
} from "../schemas/security_aliases_schema.js";

export async function upsertSecurityAliases(
  db: DB,
  data: NewSecurityAlias[]
): Promise<SecurityAlias[]> {
  if (data.length === 0) return [];

  return db
    .insert(securityAliases)
    .values(data)
    .onConflictDoUpdate({
      target: [securityAliases.source, securityAliases.externalId],
      set: {
        securityId: sql`excluded.security_id`,
        symbol: sql`excluded.symbol`,
        rawSymbol: sql`excluded.raw_symbol`,
        currencyCode: sql`excluded.currency_code`,
        exchangeCode: sql`excluded.exchange_code`,
        exchangeMicCode: sql`excluded.exchange_mic_code`,
        updatedAt: sql`now()`,
      },
    })
    .returning();
}
