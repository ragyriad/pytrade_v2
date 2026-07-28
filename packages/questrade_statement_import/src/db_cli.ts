import { closeDbConnection, db } from "@repo/db";
import { resolveReportsDirectory } from "./cli_paths.js";
import { saveExtractedStatements } from "./database.js";
import { extractStatements } from "./parser.js";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function main(): Promise<void> {
  const input = resolveReportsDirectory();
  const data = await extractStatements(input);
  const result = await saveExtractedStatements(db, data, {
    allowErrors: hasFlag("--allow-errors"),
    dryRun: hasFlag("--dry-run"),
  });
  console.log(JSON.stringify({ input, ...result }, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbConnection();
  });
