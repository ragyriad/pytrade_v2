import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type CandidateRow = {
  id: string;
  security_key: string;
  symbol: string;
  description: string | null;
  currency_code: string | null;
  instrument_type_description: string | null;
  transaction_count: number;
  transaction_types: string[];
};

const candidateQuery = `
  select
    s.id,
    s.security_key,
    s.symbol,
    s.description,
    s.currency_code,
    s.instrument_type_description,
    count(t.id)::int as transaction_count,
    array_agg(distinct coalesce(t.action, t.type) order by coalesce(t.action, t.type)) as transaction_types
  from securities s
  join transactions t on t.security_id = s.id
  group by s.id
  having count(t.id) > 0
    and bool_and(coalesce(t.action, t.type) in ('INTEREST', 'REFUND'))
    and bool_and(coalesce(t.units, 0) = 0)
    and bool_and(coalesce(t.price, 0) = 0)
  order by s.symbol
`;

async function main() {
  const apply = process.argv.includes("--apply");
  const candidates = await client.unsafe<CandidateRow[]>(candidateQuery);

  console.log(JSON.stringify(candidates, null, 2));

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to unlink transactions and delete these securities.");
    return;
  }

  await client.begin(async (tx) => {
    const candidateIds = candidates.map((candidate) => candidate.id);
    if (candidateIds.length === 0) return;

    await tx`
      update transactions
      set security_id = null
      where security_id in ${tx(candidateIds)}
    `;

    await tx`
      delete from securities
      where id in ${tx(candidateIds)}
    `;
  });

  console.log(`Removed ${candidates.length} cash interest securities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
