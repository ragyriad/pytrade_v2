import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Run this command through the configured dotenv wrapper."
  );
}

const client = postgres(connectionString);
const nonSnaptradeImportSources = [
  "questrade legacy",
  "legacy_sqlite",
  "questrade_statements",
];

async function sourceCounts() {
  return client.unsafe(`
    select 'transactions' as table_name, source, is_archived, count(*)::int as rows
    from transactions
    group by source, is_archived
    union all
    select 'securities', source, is_archived, count(*)::int
    from securities
    group by source, is_archived
    union all
    select 'security_aliases', source, is_archived, count(*)::int
    from security_aliases
    group by source, is_archived
    union all
    select 'account_balances', source, false, count(*)::int
    from account_balances
    group by source
    union all
    select 'holdings', source, false, count(*)::int
    from holdings
    group by source
    order by table_name, source, is_archived
  `);
}

async function amdOptionState() {
  return client.unsafe(`
    select
      coalesce(t.underlying_security_id::text, t.security_id::text, upper(t.symbol), 'UNKNOWN') as group_key,
      coalesce(us.symbol, ds.symbol, t.symbol, 'UNKNOWN') as symbol,
      coalesce(us.source, ds.source, 'UNKNOWN') as security_source,
      coalesce(us.security_key, ds.security_key) as security_key,
      coalesce(us.snaptrade_symbol_id, ds.snaptrade_symbol_id) as snaptrade_symbol_id,
      coalesce(us.figi_code, ds.figi_code) as figi_code,
      coalesce(us.exchange_mic_code, ds.exchange_mic_code, us.exchange_code, ds.exchange_code) as exchange,
      coalesce(us.instrument_type_code, ds.instrument_type_code) as instrument_type,
      count(*)::int as transaction_count,
      count(distinct t.option_id)::int as option_count
    from transactions t
    left join securities us on us.id = t.underlying_security_id
    left join securities ds on ds.id = t.security_id
    where t.is_archived = false
      and upper(coalesce(t.asset_type, '')) = 'OPTION'
      and upper(coalesce(t.symbol, us.symbol, ds.symbol, '')) = 'AMD'
    group by
      coalesce(t.underlying_security_id::text, t.security_id::text, upper(t.symbol), 'UNKNOWN'),
      coalesce(us.symbol, ds.symbol, t.symbol, 'UNKNOWN'),
      coalesce(us.source, ds.source, 'UNKNOWN'),
      coalesce(us.security_key, ds.security_key),
      coalesce(us.snaptrade_symbol_id, ds.snaptrade_symbol_id),
      coalesce(us.figi_code, ds.figi_code),
      coalesce(us.exchange_mic_code, ds.exchange_mic_code, us.exchange_code, ds.exchange_code),
      coalesce(us.instrument_type_code, ds.instrument_type_code)
    order by transaction_count desc, group_key
  `);
}

async function xyzSecurityState() {
  return client.unsafe(`
    select
      s.id,
      s.security_key,
      s.source,
      s.is_archived,
      s.symbol,
      s.raw_symbol,
      s.snaptrade_symbol_id,
      s.figi_code,
      s.exchange_mic_code,
      count(a.id)::int as alias_count,
      array_remove(array_agg(distinct a.symbol), null) as alias_symbols
    from securities s
    left join security_aliases a
      on a.security_id = s.id
      and a.is_archived = false
    where upper(s.symbol) in ('SQ', 'XYZ')
       or upper(coalesce(s.raw_symbol, '')) in ('SQ', 'XYZ')
       or exists (
         select 1 from security_aliases candidate
         where candidate.security_id = s.id
           and upper(candidate.symbol) in ('SQ', 'XYZ')
       )
    group by s.id
    order by s.is_archived, s.security_key
  `);
}

async function printState(mode: "preview" | "after") {
  const [database] = await client.unsafe(`
    select current_database() as database, inet_server_addr()::text as server
  `);
  console.log(`\n${mode.toUpperCase()} database target:`, database);
  console.log("\nRows by source:");
  console.table(await sourceCounts());
  console.log("\nActive AMD option groups:");
  console.table(await amdOptionState());
  console.log("\nSQ / XYZ security candidates:");
  console.table(await xyzSecurityState());
}

async function applyReset() {
  const results = await client.begin(async (sql) => {
    const deletedTransactions = await sql`
      delete from transactions
      where lower(source) = any(
        ${sql.array(nonSnaptradeImportSources)}::text[]
      )
      returning id
    `;
    const archivedSnaptradeTransactions = await sql`
      update transactions
      set is_archived = true
      where upper(source) = 'SNAPTRADE'
        and is_archived = false
      returning id
    `;
    const deletedHoldings = await sql`
      delete from holdings
      where lower(source) = any(
        ${sql.array(nonSnaptradeImportSources)}::text[]
      )
      returning id
    `;
    const deletedBalances = await sql`
      delete from account_balances
      where lower(source) = any(
        ${sql.array(nonSnaptradeImportSources)}::text[]
      )
      returning id
    `;

    // Options have no source column. Keep/archive only contracts whose
    // contract and underlying security are both SnapTrade-owned; all other
    // contracts are recreated by their importer.
    const deletedOptions = await sql`
      delete from options o
      where not exists (
        select 1
        from securities contract
        join securities underlying on underlying.id = o.underlying_security_id
        where contract.id = o.security_id
          and upper(contract.source) = 'SNAPTRADE'
          and upper(underlying.source) = 'SNAPTRADE'
      )
      returning id
    `;
    const archivedSnaptradeOptions = await sql`
      update options
      set is_archived = true, updated_at = now()
      where is_archived = false
      returning id
    `;

    const deletedAliases = await sql`
      delete from security_aliases
      where lower(source) = any(
        ${sql.array(nonSnaptradeImportSources)}::text[]
      )
      returning id
    `;
    const archivedSnaptradeAliases = await sql`
      update security_aliases
      set is_archived = true, updated_at = now()
      where upper(source) = 'SNAPTRADE'
        and is_archived = false
      returning id
    `;

    const deletedSecurities = await sql`
      delete from securities
      where lower(source) = any(
        ${sql.array(nonSnaptradeImportSources)}::text[]
      )
      returning id
    `;
    const archivedSnaptradeSecurities = await sql`
      update securities
      set is_archived = true, updated_at = now()
      where upper(source) = 'SNAPTRADE'
        and is_archived = false
      returning id
    `;
    const archivedSnaptradeAccounts = await sql`
      update accounts
      set is_archived = true, updated_at = now()
      where snaptrade_account_id is not null
        and is_archived = false
      returning id
    `;

    return {
      deletedTransactions: deletedTransactions.length,
      archivedSnaptradeTransactions: archivedSnaptradeTransactions.length,
      deletedHoldings: deletedHoldings.length,
      deletedBalances: deletedBalances.length,
      deletedOptions: deletedOptions.length,
      archivedSnaptradeOptions: archivedSnaptradeOptions.length,
      deletedAliases: deletedAliases.length,
      archivedSnaptradeAliases: archivedSnaptradeAliases.length,
      deletedSecurities: deletedSecurities.length,
      archivedSnaptradeSecurities: archivedSnaptradeSecurities.length,
      archivedSnaptradeAccounts: archivedSnaptradeAccounts.length,
    };
  });

  console.log("\nReset result:");
  console.table(results);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm=RESET-IMPORTS");
  await printState("preview");

  if (!apply) {
    console.log(
      "\nPreview only. Apply with --apply --confirm=RESET-IMPORTS."
    );
    return;
  }
  if (!confirmed) {
    throw new Error(
      "Destructive reset requires --confirm=RESET-IMPORTS."
    );
  }

  await applyReset();
  await printState("after");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
