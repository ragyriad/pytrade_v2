import * as dotenv from "dotenv";
import postgres from "postgres";
import { resolve } from "node:path";
import {
  planSecurityDuplicates,
  planStoredTransactionDuplicates,
  type SecurityDuplicatePlan,
  type StoredTransactionLike,
} from "@repo/data-deduplicator";
import { canonicalizeSymbol } from "@repo/data-normalizer";

dotenv.config({ path: resolve(process.cwd(), "../.env"), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type TransactionRow = {
  id: string;
  account_id: string;
  source: string | null;
  snaptrade_transaction_id: string | null;
  external_transaction_id: string | null;
  trade_date: Date | string;
  settlement_date: string | null;
  type: string | null;
  action: string | null;
  description: string | null;
  amount: string | number;
  units: string | number | null;
  price: string | number | null;
  fee: string | number | null;
  currency_code: string | null;
  symbol: string | null;
  created_at: Date | string | null;
  security_id: string | null;
};

type SecurityRow = {
  id: string;
  security_key: string;
  source: string;
  symbol: string;
  currency_code: string | null;
  snaptrade_symbol_id: string | null;
  figi_code: string | null;
  exchange_code: string | null;
  exchange_mic_code: string | null;
  exchange_name: string | null;
  instrument_type_code: string | null;
  transaction_count: number;
  alias_count: number;
};

type PlannedSecurityMerge = SecurityDuplicatePlan & {
  duplicateIds: string[];
};

function toStoredTransaction(row: TransactionRow): StoredTransactionLike {
  return {
    id: row.id,
    accountId: row.account_id,
    source: row.source,
    snaptradeTransactionId: row.snaptrade_transaction_id,
    externalTransactionId: row.external_transaction_id,
    tradeDate: row.trade_date,
    settlementDate: row.settlement_date,
    type: row.type,
    action: row.action,
    description: row.description,
    amount: row.amount,
    units: row.units,
    price: row.price,
    fee: row.fee,
    currencyCode: row.currency_code,
    symbol: row.symbol,
    createdAt: row.created_at,
    securityId: row.security_id,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const [rows, securityRows] = await Promise.all([
    client<TransactionRow[]>`
    select
      id,
      account_id,
      source,
      snaptrade_transaction_id,
      external_transaction_id,
      trade_date,
      coalesce(
        raw_data ->> 'settlementDate',
        raw_data ->> 'settlement_date'
      ) as settlement_date,
      type,
      action,
      description,
      amount,
      units,
      price,
      fee,
      currency_code,
      symbol,
      created_at,
      security_id
    from transactions
    where is_archived = false
    `,
    client<SecurityRow[]>`
      select
        s.id,
        s.security_key,
        s.source,
        s.symbol,
        s.currency_code,
        s.snaptrade_symbol_id,
        s.figi_code,
        s.exchange_code,
        s.exchange_mic_code,
        s.exchange_name,
        s.instrument_type_code,
        count(distinct t.id)::int as transaction_count,
        count(distinct a.id)::int as alias_count
      from securities s
      left join transactions t
        on t.security_id = s.id or t.underlying_security_id = s.id
      left join security_aliases a on a.security_id = s.id
      where s.is_archived = false
      group by s.id
    `,
  ]);

  const decisions = planStoredTransactionDuplicates(rows.map(toStoredTransaction));
  const archiveIds = [
    ...new Set(decisions.map((decision) => decision.duplicateId)),
  ];
  const byConfidence = decisions.reduce<Record<string, number>>(
    (counts, decision) => {
      counts[decision.confidence] = (counts[decision.confidence] ?? 0) + 1;
      return counts;
    },
    {}
  );
  const securityRowsById = new Map(
    securityRows.map((security) => [security.id, security])
  );
  const securityPlans = planSecurityDuplicates(
    securityRows.map((security) => ({
      id: security.id,
      canonicalSymbol:
        canonicalizeSymbol(security.symbol) ?? security.symbol.toUpperCase(),
      storedSymbol: security.symbol.trim().toUpperCase(),
      canonicalType: security.instrument_type_code,
      isSynthetic:
        security.source !== "SNAPTRADE" ||
        security.security_key.includes("exchange:unknown") ||
        security.security_key.startsWith("recovered:") ||
        security.security_key.startsWith("statement:") ||
        security.security_key.startsWith("legacy-security:"),
      hasProviderId: Boolean(security.snaptrade_symbol_id),
      hasFigi: Boolean(security.figi_code),
      hasExchange: Boolean(
        security.exchange_mic_code ||
          security.exchange_code ||
          security.exchange_name
      ),
      transactionCount: security.transaction_count,
      aliasCount: security.alias_count,
    }))
  );
  const securityMerges: PlannedSecurityMerge[] = securityPlans
    .map((plan) => {
      const keeper = securityRowsById.get(plan.keeperId)!;
      const duplicateIds = plan.duplicateIds.filter((id) => {
        const duplicate = securityRowsById.get(id)!;
        const sameProviderIdentity =
          Boolean(
            keeper.snaptrade_symbol_id &&
              duplicate.snaptrade_symbol_id === keeper.snaptrade_symbol_id
          ) ||
          Boolean(keeper.figi_code && duplicate.figi_code === keeper.figi_code);
        const placeholderIdentity =
          duplicate.security_key.includes("exchange:unknown") ||
          duplicate.security_key.startsWith("recovered:") ||
          duplicate.security_key.startsWith("statement:") ||
          duplicate.security_key.startsWith("legacy-security:");
        const currencyCompatible =
          !keeper.currency_code ||
          !duplicate.currency_code ||
          keeper.currency_code === duplicate.currency_code;
        return sameProviderIdentity || (placeholderIdentity && currencyCompatible);
      });
      return { ...plan, duplicateIds };
    })
    .filter((plan) => plan.duplicateIds.length > 0);

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "preview",
        activeRowsScanned: rows.length,
        rowsToArchive: archiveIds.length,
        byConfidence,
        sample: decisions.slice(0, 25),
        securityRowsScanned: securityRows.length,
        securityGroupsToMerge: securityMerges.length,
        securityRowsToMerge: securityMerges.reduce(
          (count, plan) => count + plan.duplicateIds.length,
          0
        ),
        securityMergeSample: securityMerges.slice(0, 25),
      },
      null,
      2
    )
  );

  if (!apply) return;

  await client.begin(async (sql) => {
    if (archiveIds.length > 0) {
      await sql`
        update transactions
        set is_archived = true
        where id = any(${sql.array(archiveIds)}::uuid[])
          and is_archived = false
      `;
    }

    for (const plan of securityMerges) {
      const duplicateIds = plan.duplicateIds;
      const groupIds = [plan.keeperId, ...duplicateIds];
      await sql`
        update transactions
        set security_id = ${plan.keeperId}
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update transactions
        set underlying_security_id = ${plan.keeperId},
            symbol = ${plan.canonicalSymbol}
        where underlying_security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update holdings
        set security_id = ${plan.keeperId}, updated_at = now()
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update holdings
        set underlying_security_id = ${plan.keeperId}, updated_at = now()
        where underlying_security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update positions
        set security_id = ${plan.keeperId}
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update orders
        set security_id = ${plan.keeperId}
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update options
        set security_id = ${plan.keeperId}, updated_at = now()
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update options
        set underlying_security_id = ${plan.keeperId}, updated_at = now()
        where underlying_security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update dividend_events
        set security_id = ${plan.keeperId}, updated_at = now()
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update security_price_snapshots
        set security_id = ${plan.keeperId}, updated_at = now()
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;

      await sql`
        with ranked_external as (
          select
            id,
            row_number() over (
              partition by source, external_id
              order by
                case when security_id = ${plan.keeperId} then 0 else 1 end,
                id
            ) as rank
          from security_aliases
          where security_id = any(${sql.array(groupIds)}::uuid[])
            and external_id is not null
        )
        delete from security_aliases
        where id in (select id from ranked_external where rank > 1)
      `;
      await sql`
        with ranked_symbol as (
          select
            id,
            row_number() over (
              partition by
                source,
                symbol,
                coalesce(currency_code, ''),
                coalesce(exchange_code, '')
              order by
                case when security_id = ${plan.keeperId} then 0 else 1 end,
                id
            ) as rank
          from security_aliases
          where security_id = any(${sql.array(groupIds)}::uuid[])
        )
        delete from security_aliases
        where id in (select id from ranked_symbol where rank > 1)
      `;
      await sql`
        update security_aliases
        set security_id = ${plan.keeperId}, updated_at = now()
        where security_id = any(${sql.array(duplicateIds)}::uuid[])
      `;
      await sql`
        update securities
        set
          symbol = ${plan.canonicalSymbol},
          instrument_type_code = coalesce(
            ${plan.canonicalType},
            instrument_type_code
          ),
          instrument_type_description = coalesce(
            ${plan.canonicalType},
            instrument_type_description
          ),
          first_seen_at = (
            select min(first_seen_at)
            from securities
            where id = any(${sql.array(groupIds)}::uuid[])
          ),
          last_seen_at = (
            select max(last_seen_at)
            from securities
            where id = any(${sql.array(groupIds)}::uuid[])
          ),
          updated_at = now()
        where id = ${plan.keeperId}
      `;
      await sql`
        delete from securities
        where id = any(${sql.array(duplicateIds)}::uuid[])
      `;
    }
  });
  console.log(`Archived ${archiveIds.length} duplicate transaction row(s).`);
  console.log(
    `Merged ${securityMerges.reduce(
      (count, plan) => count + plan.duplicateIds.length,
      0
    )} duplicate security row(s).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
