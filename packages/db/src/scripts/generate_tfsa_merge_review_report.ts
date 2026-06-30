import * as dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { getWorkspaceParentEnvPath } from "../env.js";

dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set.");
}

const legacyAccountNumber = "51983522";
const canonicalAccountNumber = "9e03899b-ba31-4982-01ce-274278019c28";
const reportDir = path.resolve(
  process.cwd(),
  "..",
  "..",
  "reports",
  "tfsa-merge-review"
);

const client = postgres(connectionString);

type TxRow = {
  id: string;
  account_id: string;
  account_number: string;
  snaptrade_transaction_id: string | null;
  external_transaction_id: string | null;
  legacy_import_key: string | null;
  source: string;
  security_id: string | null;
  security_symbol: string | null;
  security_description: string | null;
  type: string;
  action: string | null;
  asset_type: string | null;
  symbol: string | null;
  amount: string;
  units: string | null;
  price: string | null;
  fee: string;
  currency_code: string | null;
  description: string | null;
  trade_date: string;
  created_at: string;
};

type MatchResult = {
  candidate: TxRow | null;
  confidence: number;
  score: number;
  reasons: string[];
  risks: string[];
};

type ReportRow = {
  decision: "DISABLE_DUPLICATE" | "MOVE_TO_CANONICAL" | "REVIEW";
  review_bucket: string;
  confidence: string;
  score: string;
  legacy_transaction_id: string;
  canonical_match_id: string;
  legacy_snaptrade_id: string;
  canonical_snaptrade_id: string;
  legacy_import_key: string;
  legacy_trade_date: string;
  canonical_trade_date: string;
  legacy_symbol: string;
  canonical_symbol: string;
  legacy_security_symbol: string;
  canonical_security_symbol: string;
  legacy_action: string;
  canonical_action: string;
  legacy_type: string;
  canonical_type: string;
  legacy_asset_type: string;
  canonical_asset_type: string;
  legacy_amount: string;
  canonical_amount: string;
  legacy_units: string;
  canonical_units: string;
  legacy_price: string;
  canonical_price: string;
  legacy_fee: string;
  canonical_fee: string;
  legacy_currency: string;
  canonical_currency: string;
  legacy_description: string;
  canonical_description: string;
  match_reasons: string;
  risk_notes: string;
};

type CandidateRow = ReportRow & {
  rank: string;
};

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function normalizeText(value: string | null | undefined): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeSymbol(value: string | null | undefined): string {
  return clean(value)
    .toUpperCase()
    .replace(/\.TO$/, "")
    .replace(/\.VN$/, "")
    .replace(/\.NE$/, "")
    .replace(/[^A-Z0-9]/g, "");
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function numberClose(
  left: string | number | null | undefined,
  right: string | number | null | undefined,
  tolerance: number
): boolean {
  const leftNumber = toNumber(left);
  const rightNumber = toNumber(right);
  if (leftNumber == null || rightNumber == null) return leftNumber === rightNumber;
  return Math.abs(leftNumber - rightNumber) <= tolerance;
}

function dateOnly(value: string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function daysBetween(left: string, right: string): number {
  const leftTime = new Date(dateOnly(left)).getTime();
  const rightTime = new Date(dateOnly(right)).getTime();
  return Math.round(Math.abs(leftTime - rightTime) / 86_400_000);
}

function tokenSet(value: string | null | undefined): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2)
  );
}

function jaccard(left: string | null | undefined, right: string | null | undefined): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 && rightTokens.size === 0) return 1;
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }

  return intersection / new Set([...leftTokens, ...rightTokens]).size;
}

function actionOf(row: TxRow): string {
  return normalizeText(row.action ?? row.type);
}

function displaySymbol(row: TxRow): string {
  return clean(row.symbol || row.security_symbol);
}

function symbolsMatch(left: TxRow, right: TxRow): boolean {
  const leftSymbol = normalizeSymbol(displaySymbol(left));
  const rightSymbol = normalizeSymbol(displaySymbol(right));
  if (!leftSymbol || !rightSymbol) return false;
  return leftSymbol === rightSymbol;
}

function scoreCandidate(legacy: TxRow, candidate: TxRow): MatchResult {
  const reasons: string[] = [];
  const risks: string[] = [];
  let score = 0;

  const dateDelta = daysBetween(legacy.trade_date, candidate.trade_date);
  if (dateDelta === 0) {
    score += 30;
    reasons.push("same trade date");
  } else if (dateDelta <= 2) {
    score += 18;
    risks.push(`trade date differs by ${dateDelta} days`);
  } else if (dateDelta <= 7) {
    score += 8;
    risks.push(`trade date differs by ${dateDelta} days`);
  } else {
    risks.push(`trade date differs by ${dateDelta} days`);
  }

  if (numberClose(legacy.amount, candidate.amount, 0.01)) {
    score += 25;
    reasons.push("same amount");
  } else if (numberClose(Math.abs(Number(legacy.amount)), Math.abs(Number(candidate.amount)), 0.01)) {
    score += 10;
    risks.push("same absolute amount but sign differs");
  }

  if (clean(legacy.currency_code) === clean(candidate.currency_code)) {
    score += 10;
    reasons.push("same currency");
  } else {
    risks.push("currency differs");
  }

  if (actionOf(legacy) === actionOf(candidate)) {
    score += 10;
    reasons.push("same action/type");
  } else {
    risks.push("action/type differs");
  }

  if (numberClose(legacy.units, candidate.units, 0.000001)) {
    score += 8;
    reasons.push("same units");
  } else if (toNumber(legacy.units) !== null || toNumber(candidate.units) !== null) {
    risks.push("units differ");
  }

  if (numberClose(legacy.price, candidate.price, 0.01)) {
    score += 5;
    reasons.push("same price");
  }

  if (numberClose(legacy.fee, candidate.fee, 0.0001)) {
    score += 3;
    reasons.push("same fee");
  }

  if (symbolsMatch(legacy, candidate)) {
    score += 12;
    reasons.push("same normalized symbol");
  } else if (displaySymbol(legacy) || displaySymbol(candidate)) {
    risks.push("symbol mismatch");
  }

  const legacyDescription = normalizeText(legacy.description);
  const candidateDescription = normalizeText(candidate.description);
  if (legacyDescription && legacyDescription === candidateDescription) {
    score += 15;
    reasons.push("same description");
  } else {
    const similarity = jaccard(legacy.description, candidate.description);
    if (similarity >= 0.7) {
      score += 8;
      reasons.push(`similar description (${similarity.toFixed(2)})`);
    } else if (similarity > 0) {
      risks.push(`description similarity ${similarity.toFixed(2)}`);
    }
  }

  const confidence = Math.min(1, score / 100);
  return { candidate, confidence, score, reasons, risks };
}

function findTopMatches(legacy: TxRow, canonicalRows: TxRow[], limit = 5): MatchResult[] {
  const legacyDate = new Date(legacy.trade_date);
  const candidates = canonicalRows.filter((candidate) => {
    const candidateDate = new Date(candidate.trade_date);
    const dayDelta = Math.abs(
      Math.round((legacyDate.getTime() - candidateDate.getTime()) / 86_400_000)
    );
    return (
      dayDelta <= 14 ||
      numberClose(legacy.amount, candidate.amount, 0.01) ||
      symbolsMatch(legacy, candidate)
    );
  });

  return candidates
    .map((candidate) => scoreCandidate(legacy, candidate))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

function classify(legacy: TxRow, best: MatchResult | null): ReportRow["decision"] {
  if (!best?.candidate) return "MOVE_TO_CANONICAL";
  if (best.score >= 82) return "DISABLE_DUPLICATE";
  if (best.score >= 55) return "REVIEW";

  const sameDate = daysBetween(legacy.trade_date, best.candidate.trade_date) === 0;
  const sameAmount = numberClose(legacy.amount, best.candidate.amount, 0.01);
  if (sameDate && sameAmount) return "REVIEW";

  return "MOVE_TO_CANONICAL";
}

function bucketFor(decision: ReportRow["decision"], best: MatchResult | null): string {
  if (decision === "MOVE_TO_CANONICAL") return "moves";
  if (decision === "DISABLE_DUPLICATE") {
    return best?.risks.some((risk) => risk.includes("symbol")) ? "symbol_mismatches" : "duplicates";
  }
  if (best?.risks.some((risk) => risk.includes("symbol"))) return "symbol_mismatches";
  return "manual_review";
}

function toReportRow(legacy: TxRow, best: MatchResult | null): ReportRow {
  const candidate = best?.candidate ?? null;
  const decision = classify(legacy, best);

  return {
    decision,
    review_bucket: bucketFor(decision, best),
    confidence: best ? best.confidence.toFixed(2) : "0.00",
    score: best ? String(best.score) : "0",
    legacy_transaction_id: legacy.id,
    canonical_match_id: candidate?.id ?? "",
    legacy_snaptrade_id: legacy.snaptrade_transaction_id ?? "",
    canonical_snaptrade_id: candidate?.snaptrade_transaction_id ?? "",
    legacy_import_key: legacy.legacy_import_key ?? "",
    legacy_trade_date: dateOnly(legacy.trade_date),
    canonical_trade_date: candidate ? dateOnly(candidate.trade_date) : "",
    legacy_symbol: clean(legacy.symbol),
    canonical_symbol: clean(candidate?.symbol),
    legacy_security_symbol: clean(legacy.security_symbol),
    canonical_security_symbol: clean(candidate?.security_symbol),
    legacy_action: clean(legacy.action),
    canonical_action: clean(candidate?.action),
    legacy_type: legacy.type,
    canonical_type: candidate?.type ?? "",
    legacy_asset_type: clean(legacy.asset_type),
    canonical_asset_type: clean(candidate?.asset_type),
    legacy_amount: legacy.amount,
    canonical_amount: candidate?.amount ?? "",
    legacy_units: clean(legacy.units),
    canonical_units: clean(candidate?.units),
    legacy_price: clean(legacy.price),
    canonical_price: clean(candidate?.price),
    legacy_fee: legacy.fee,
    canonical_fee: candidate?.fee ?? "",
    legacy_currency: clean(legacy.currency_code),
    canonical_currency: clean(candidate?.currency_code),
    legacy_description: clean(legacy.description),
    canonical_description: clean(candidate?.description),
    match_reasons: best?.reasons.join("; ") ?? "no plausible canonical match",
    risk_notes: best?.risks.join("; ") ?? "",
  };
}

function toCandidateRows(legacy: TxRow, matches: MatchResult[]): CandidateRow[] {
  return matches.map((match, index) => ({
    ...toReportRow(legacy, match),
    rank: String(index + 1),
  }));
}

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv<T extends Record<string, unknown>>(rows: T[], headers: Array<keyof T>): string {
  return [
    headers.map((header) => csvEscape(String(header))).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
}

async function loadTransactions(accountNumber: string): Promise<TxRow[]> {
  return client.unsafe<TxRow[]>(
    `
      select
        t.id,
        t.account_id,
        a.brokerage_account_number as account_number,
        t.snaptrade_transaction_id,
        t.external_transaction_id,
        t.legacy_import_key,
        t.source,
        t.security_id,
        s.symbol as security_symbol,
        s.description as security_description,
        t.type,
        t.action,
        t.asset_type,
        t.symbol,
        t.amount::text,
        t.units::text,
        t.price::text,
        t.fee::text,
        t.currency_code,
        t.description,
        t.trade_date::text,
        t.created_at::text
      from transactions t
      join accounts a on a.id = t.account_id
      left join securities s on s.id = t.security_id
      where a.brokerage_account_number = $1
      order by t.trade_date, t.created_at, t.id
    `,
    [accountNumber]
  );
}

async function main() {
  const legacyRows = await loadTransactions(legacyAccountNumber);
  const canonicalRows = await loadTransactions(canonicalAccountNumber);

  const allRows: ReportRow[] = [];
  const candidateRows: CandidateRow[] = [];

  for (const legacy of legacyRows) {
    const matches = findTopMatches(legacy, canonicalRows);
    const best = matches[0] ?? null;
    allRows.push(toReportRow(legacy, best));

    if (best && (classify(legacy, best) === "REVIEW" || best.risks.length > 0)) {
      candidateRows.push(...toCandidateRows(legacy, matches));
    }
  }

  const headers = Object.keys(allRows[0] ?? {}) as Array<keyof ReportRow>;
  const candidateHeaders = Object.keys(candidateRows[0] ?? {
    ...allRows[0],
    rank: "",
  }) as Array<keyof CandidateRow>;

  const duplicates = allRows.filter((row) => row.decision === "DISABLE_DUPLICATE");
  const moves = allRows.filter((row) => row.decision === "MOVE_TO_CANONICAL");
  const manualReview = allRows.filter((row) => row.decision === "REVIEW");
  const symbolMismatches = allRows.filter((row) =>
    row.risk_notes.toLowerCase().includes("symbol mismatch")
  );
  const uncertainOptions = candidateRows.filter(
    (row) => row.decision === "REVIEW" || row.risk_notes
  );

  await mkdir(reportDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(reportDir, "all_transactions.csv"), toCsv(allRows, headers)),
    writeFile(path.join(reportDir, "duplicates_to_disable.csv"), toCsv(duplicates, headers)),
    writeFile(path.join(reportDir, "moves_to_canonical.csv"), toCsv(moves, headers)),
    writeFile(path.join(reportDir, "manual_review.csv"), toCsv(manualReview, headers)),
    writeFile(path.join(reportDir, "symbol_mismatches.csv"), toCsv(symbolMismatches, headers)),
    writeFile(
      path.join(reportDir, "uncertain_options.csv"),
      toCsv(uncertainOptions, candidateHeaders)
    ),
    writeFile(
      path.join(reportDir, "summary.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          legacyAccountNumber,
          canonicalAccountNumber,
          legacyTransactionsScanned: legacyRows.length,
          canonicalTransactionsCompared: canonicalRows.length,
          decisions: {
            disableDuplicates: duplicates.length,
            moveToCanonical: moves.length,
            manualReview: manualReview.length,
            symbolMismatches: symbolMismatches.length,
            uncertainOptions: uncertainOptions.length,
          },
          files: {
            allTransactions: "all_transactions.csv",
            duplicatesToDisable: "duplicates_to_disable.csv",
            movesToCanonical: "moves_to_canonical.csv",
            manualReview: "manual_review.csv",
            symbolMismatches: "symbol_mismatches.csv",
            uncertainOptions: "uncertain_options.csv",
          },
        },
        null,
        2
      )
    ),
  ]);

  console.log(`Report written to ${reportDir}`);
  console.log(`Legacy transactions scanned: ${legacyRows.length}`);
  console.log(`Canonical transactions compared: ${canonicalRows.length}`);
  console.log(`Duplicate disables: ${duplicates.length}`);
  console.log(`Moves to canonical: ${moves.length}`);
  console.log(`Manual review: ${manualReview.length}`);
  console.log(`Symbol mismatches: ${symbolMismatches.length}`);
  console.log(`Uncertain match options: ${uncertainOptions.length}`);

  await client.end();
}

main().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exitCode = 1;
});
