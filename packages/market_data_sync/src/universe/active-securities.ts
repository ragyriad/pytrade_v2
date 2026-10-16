import { and, db, eq, positions, securities, sql } from "@repo/db";
import type { DB, Security } from "@repo/db";
import type { MarketDataSecurity } from "../shared/provider-types.js";

export type SecurityUniverseOptions = {
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
  const eligibleInstrument = sql`(
    upper(trim(coalesce(${securities.instrumentTypeCode}, ''))) in ('STOCK', 'ETF', 'CS', 'EQUITY')
    or upper(trim(coalesce(${securities.instrumentTypeDescription}, ''))) in ('STOCK', 'ETF', 'EQUITY', 'COMMON STOCK')
    or upper(coalesce(${securities.instrumentTypeDescription}, '')) ~ '(^|[^A-Z])(ETF|EXCHANGE[- ]TRADED FUND|COMMON STOCK|STOCK|EQUITY)([^A-Z]|$)'
  )`;
  const eligibleSecurity = and(
    eq(securities.isArchived, false),
    eq(securities.listingStatus, "ACTIVE"),
    eligibleInstrument
  );
  const rows = (
    await database
      .select({ security: securities })
      .from(positions)
      .innerJoin(securities, eq(positions.securityId, securities.id))
      .where(
        and(
          sql`${positions.securityId} is not null and ${positions.units}::numeric <> 0`,
          eligibleSecurity
        )
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
