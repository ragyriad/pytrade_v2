import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extractStatements } from "./parser.js";
import { writeReviewWorkbook } from "./workbook.js";

function argument(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
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
  const outputDirectory = fileURLToPath(
    new URL("../../../generated files/", import.meta.url),
  );
  const requestedFilename = argument("--output");
  const output = path.join(
    outputDirectory,
    requestedFilename ? path.basename(requestedFilename) : "Questrade_Statements_Review.xlsx",
  );
  await mkdir(outputDirectory, { recursive: true });
  const data = await extractStatements(input);
  await writeReviewWorkbook(output, data);
  const errors = data.issues.filter((issue) => issue.severity === "ERROR").length;
  const warnings = data.issues.filter((issue) => issue.severity === "WARNING").length;
  console.log(JSON.stringify({
    output,
    statements: data.statements.length,
    cashBalances: data.cashBalances.length,
    holdings: data.holdings.length,
    transactions: data.transactions.length,
    errors,
    warnings,
  }, null, 2));
  if (errors > 0) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
