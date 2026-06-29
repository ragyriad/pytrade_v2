import * as dotenv from "dotenv";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const client = postgres(connectionString);

type SecurityRow = {
  id: string;
  security_key: string;
  symbol: string;
  raw_symbol: string | null;
  description: string | null;
  instrument_type_code: string | null;
  instrument_type_description: string | null;
};

type SecurityFix = {
  symbol: string;
  description: string;
  instrumentTypeDescription: string;
};

const optionSymbolPattern = /^([A-Z]+)\d{2}[A-Z]{3}\d{2}[CP]\d+(?:\.\d+)?$/i;

const securityFixesByTicker: Record<string, SecurityFix> = {
  AMC: {
    symbol: "AMC",
    description: "AMC Entertainment Holdings, Inc.",
    instrumentTypeDescription: "Class A Common Stock",
  },
  AMD: {
    symbol: "AMD",
    description: "Advanced Micro Devices, Inc.",
    instrumentTypeDescription: "Common Stock",
  },
  ARKF: {
    symbol: "ARKF",
    description: "ARK Blockchain & Fintech Innovation ETF",
    instrumentTypeDescription: "Exchange Traded Fund",
  },
  BB: {
    symbol: "BB",
    description: "BlackBerry Limited",
    instrumentTypeDescription: "Common Stock",
  },
  BIDU: {
    symbol: "BIDU",
    description: "Baidu, Inc.",
    instrumentTypeDescription: "American Depositary Shares",
  },
  CNQ: {
    symbol: "CNQ",
    description: "Canadian Natural Resources Limited",
    instrumentTypeDescription: "Common Stock",
  },
  DIS: {
    symbol: "DIS",
    description: "Walt Disney Company (The)",
    instrumentTypeDescription: "Common Stock",
  },
  ENPH: {
    symbol: "ENPH",
    description: "Enphase Energy, Inc.",
    instrumentTypeDescription: "Common Stock",
  },
  ETSY: {
    symbol: "ETSY",
    description: "Etsy, Inc.",
    instrumentTypeDescription: "Common Stock",
  },
  F: {
    symbol: "F",
    description: "Ford Motor Company",
    instrumentTypeDescription: "Common Stock",
  },
  INTC: {
    symbol: "INTC",
    description: "Intel Corporation",
    instrumentTypeDescription: "Common Stock",
  },
  MRNA: {
    symbol: "MRNA",
    description: "Moderna, Inc.",
    instrumentTypeDescription: "Common Stock",
  },
  NVDA: {
    symbol: "NVDA",
    description: "NVIDIA Corporation",
    instrumentTypeDescription: "Common Stock",
  },
  SHOP: {
    symbol: "SHOP",
    description: "Shopify Inc.",
    instrumentTypeDescription: "Class A Subordinate Voting Shares",
  },
  SQ: {
    symbol: "XYZ",
    description: "Block, Inc.",
    instrumentTypeDescription: "Class A Common Stock",
  },
  URNM: {
    symbol: "URNM",
    description: "Sprott Uranium Miners ETF",
    instrumentTypeDescription: "Exchange Traded Fund",
  },
};

function parseUnderlyingTicker(row: SecurityRow): string | null {
  for (const value of [row.symbol, row.raw_symbol, row.description]) {
    const match = value?.match(optionSymbolPattern);
    if (match?.[1]) return match[1].toUpperCase();
  }

  return null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const rows = await client<SecurityRow[]>`
    select
      id,
      security_key,
      symbol,
      raw_symbol,
      description,
      instrument_type_code,
      instrument_type_description
    from securities
    where symbol ~* '^[A-Z]+[0-9]{2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
      or description ~* '^[A-Z]+[0-9]{2}[A-Z]{3}[0-9]{2}[CP][0-9]+(\\.[0-9]+)?$'
    order by symbol
  `;

  const planned = rows.map((row) => {
    const ticker = parseUnderlyingTicker(row);
    return {
      ...row,
      underlyingTicker: ticker,
      fix: ticker ? securityFixesByTicker[ticker] : undefined,
    };
  });

  console.log(JSON.stringify(planned, null, 2));

  const missing = planned.filter((row) => !row.fix);
  if (missing.length > 0) {
    throw new Error(
      `Missing security mappings for: ${[
        ...new Set(missing.map((row) => row.underlyingTicker ?? row.symbol)),
      ].join(", ")}`
    );
  }

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to update securities.");
    return;
  }

  await client.begin(async (tx) => {
    for (const row of planned) {
      const fix = row.fix!;
      await tx`
        update securities
        set
          symbol = ${fix.symbol},
          raw_symbol = coalesce(raw_symbol, ${row.symbol}),
          description = ${fix.description},
          instrument_type_description = ${fix.instrumentTypeDescription},
          updated_at = now()
        where id = ${row.id}
      `;
    }
  });

  console.log(`Updated ${planned.length} securities.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.end();
  });
