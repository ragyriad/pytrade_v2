import path from "node:path";
import { closeDbConnection, db } from "@repo/db";
import { saveExtractedStatements } from "./database.js";
import { extractStatements } from "./parser.js";

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function reportsDirectory(): string {
  const configured = process.env.QESTRADE_REPORTS_DIR?.trim();
  if (!configured) {
    throw new Error("Missing required environment variable: QESTRADE_REPORTS_DIR");
  }
  return path.resolve(configured);
}

async function main(): Promise<void> {
  const input = reportsDirectory();
  const data = await extractStatements(input);
  const result = await saveExtractedStatements(db, data, {
    allowErrors: hasFlag("--allow-errors"),
    dryRun: hasFlag("--dry-run"),
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDbConnection();
  });
