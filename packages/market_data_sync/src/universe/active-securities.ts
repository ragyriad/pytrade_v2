import { db, eq, positions, securities, sql } from "@repo/db";
import type { DB, Security } from "@repo/db";
import type { MarketDataSecurity } from "../providers/types.js";

export type SecurityUniverseOptions = {
  includeInactive?: boolean;
  maxSecurities?: number;
};

function toMarketDataSecurity(security: Security): MarketDataSecurity {
  return {
    id: security.id,
    symbol: security.symbol,
    rawSymbol: security.rawSymbol,
    currencyCode: security.currencyCode,
    exchangeCode: security.exchangeCode,
    exchangeMicCode: security.exchangeMicCode,
    exchangeName: security.exchangeName,
  };
}

export async function getSecurityUniverse(
  database: DB = db,
  options: SecurityUniverseOptions = {}
): Promise<MarketDataSecurity[]> {
  const rows = options.includeInactive
    ? await database.select().from(securities)
    : (
        await database
          .select({ security: securities })
          .from(positions)
          .innerJoin(securities, eq(positions.securityId, securities.id))
          .where(
            sql`${positions.securityId} is not null and ${positions.units}::numeric <> 0`
          )
      ).map((row) => row.security);

  const uniqueBySecurityId = new Map<string, Security>();

  for (const security of rows) {
    uniqueBySecurityId.set(security.id, security);
  }

  const universe = [...uniqueBySecurityId.values()]
    .sort((a, b) => a.symbol.localeCompare(b.symbol))
    .map(toMarketDataSecurity);

  return options.maxSecurities ? universe.slice(0, options.maxSecurities) : universe;
}
