import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function argument(
  name: string,
  argv: readonly string[] = process.argv
): string | null {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1]?.trim() || null : null;
}

function isDirectory(candidate: string): boolean {
  try {
    return existsSync(candidate) && statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Both workbook extraction and database import resolve the statement root in
 * exactly the same way. The extractor itself recursively discovers PDFs below
 * this directory, including RRSP and TFSA subdirectories.
 */
export function resolveReportsDirectory(
  argv: readonly string[] = process.argv,
  environment: NodeJS.ProcessEnv = process.env
): string {
  const requested = argument("--input", argv);
  const configured = environment.QESTRADE_REPORTS_DIR?.trim() || null;
  for (const [source, value] of [
    ["--input", requested],
    ["QESTRADE_REPORTS_DIR", configured],
  ] as const) {
    if (!value) continue;
    const resolved = path.resolve(value);
    if (isDirectory(resolved)) return resolved;
    throw new Error(`${source} does not point to a directory: ${resolved}`);
  }

  const workspaceRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const candidates = [
    path.join(workspaceRoot, "Questrade Reports"),
    path.join(path.dirname(workspaceRoot), "pytrade_data", "Questrade Reports"),
  ]
    .map((candidate) => path.resolve(candidate));

  const found = candidates.find(isDirectory);
  if (found) return found;

  throw new Error(
    [
      "Questrade reports directory was not found.",
      "Pass --input <directory> or set QESTRADE_REPORTS_DIR.",
      `Checked: ${candidates.join(", ")}`,
    ].join(" ")
  );
}
