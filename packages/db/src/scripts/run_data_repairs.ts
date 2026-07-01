import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const args = apply ? ["--apply"] : [];

const repairs: Array<{ label: string; script: string }> = [
  {
    label: "Merge TFSA legacy transactions by date",
    script: "src/scripts/merge_tfsa_legacy_by_date.ts",
  },
  {
    label: "Merge duplicate and renamed securities",
    script: "src/scripts/merge_duplicate_securities.ts",
  },
  {
    label: "Repair symbol aliases and transaction values",
    script: "src/scripts/repair_symbol_transaction_values.ts",
  },
  {
    label: "Clean up cash interest securities",
    script: "src/scripts/cleanup_cash_interest_securities.ts",
  },
];

function run(label: string, script: string) {
  console.log(`\n== ${label} ==`);
  const command = ["pnpm", "exec", "tsx", script, ...args].join(" ");
  const result = spawnSync(command, {
    cwd: process.cwd(),
    shell: true,
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

for (const repair of repairs) {
  run(repair.label, repair.script);
}
