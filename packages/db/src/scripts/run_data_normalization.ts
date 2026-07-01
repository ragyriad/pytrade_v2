import { spawnSync } from "node:child_process";

const apply = process.argv.includes("--apply");
const args = apply ? ["--apply"] : [];

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

run("Normalize transactions", "src/scripts/normalize_transactions.ts");
