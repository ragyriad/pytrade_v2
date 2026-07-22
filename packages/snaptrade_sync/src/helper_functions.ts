import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Types ─────────────────────────────────────────────────────────────────────

interface SaveOptions {
  data: unknown[];
  filename: string;
  brokerage: string;
  directory?: string;
}

interface SaveResult {
  filePath: string;
  filename: string;
  increment: number | null;
}

type Primitive = string | number | boolean | null;
type AnonymisableValue =
  | Primitive
  | AnonymisableObject
  | AnonymisableValue[];

interface AnonymisableObject {
  [key: string]: AnonymisableValue;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Sanitise a string for safe use in a filename:
 * lowercased, spaces → underscores, non-alphanumeric/underscore stripped.
 */
function sanitise(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChar(chars: string): string {
  return chars[Math.floor(Math.random() * chars.length)];
}

const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const DIGITS = "0123456789";


/**
 * Save an array to a JSON file inside the repository's Git-ignored
 * `generated files/` folder.
 *
 * Final filename format:
 *   {filename}_{brokerage}.json          ← first save
 *   {filename}_{brokerage}_1.json        ← second save (auto-incremented)
 *   {filename}_{brokerage}_2.json        ← third save
 *
 * @param data        - The array to serialise.
 * @param filename    - Base name for the file (the "entity" segment).
 * @param brokerage   - Brokerage name; appended after the base name.
 * @param directory   - Optional subfolder inside `generated files/`.
 * @returns           - SaveResult containing the resolved path, filename, and
 *                      the increment number used (null if no increment needed).
 */
export function saveListToJson({
  data,
  filename,
  brokerage,
  directory = "",
}: SaveOptions): SaveResult {
  // ── Validate ───────────────────────────────────────────────────────────────
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected an array, got ${typeof data}.`);
  }
  if (!filename?.trim()) {
    throw new Error("filename must be a non-empty string.");
  }
  if (!brokerage?.trim()) {
    throw new Error("brokerage must be a non-empty string.");
  }

  // ── Build target folder ────────────────────────────────────────────────────
  // __dirname resolves to the directory containing THIS file, mirroring
  // Python's os.path.dirname(os.path.abspath(__file__)).
  const targetFolder = path.resolve(__dirname, "../../../generated files", directory);
  fs.mkdirSync(targetFolder, { recursive: true });

  // ── Build the base filename ────────────────────────────────────────────────
  // Format: {entity}_{brokerage}.json  e.g. "trades_acmecorp.json"
  const cleanFilename = sanitise(filename);
  const cleanBrokerage = sanitise(brokerage);
  const baseName = `${cleanFilename}_${cleanBrokerage}`;

  // ── ✨ AUTO-INCREMENT LOGIC ────────────────────────────────────────────────
  // Check if {baseName}.json already exists. If so, try {baseName}_1.json,
  // {baseName}_2.json … until a free slot is found.
  //
  //   data/trades_acmecorp.json      ← first save   (increment: null)
  //   data/trades_acmecorp_1.json    ← second save  (increment: 1)
  //   data/trades_acmecorp_2.json    ← third save   (increment: 2)
  //
  let candidate = path.join(targetFolder, `${baseName}.json`);
  let increment: number | null = null;
  let counter = 1;

  while (fs.existsSync(candidate)) {
    increment = counter;
    candidate = path.join(targetFolder, `${baseName}_${counter}.json`);
    counter++;
  }
  // ── END AUTO-INCREMENT LOGIC ──────────────────────────────────────────────

  // ── Serialise & write ──────────────────────────────────────────────────────
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(candidate, json, { encoding: "utf-8" });

  const resolvedFilename = path.basename(candidate);
  console.log(`[saveListToJson] Saved → ${candidate}`);

  return {
    filePath: candidate,
    filename: resolvedFilename,
    increment,
  };
}

function anonymiseString(value: string): string {
  /**
   * Replace every character with a random character of the same class:
   *   - uppercase letter → random uppercase letter
   *   - lowercase letter → random lowercase letter
   *   - digit            → random digit
   *   - anything else    → kept as-is (preserves shape of emails, dates, etc.)
   */
  return value
    .split("")
    .map((ch) => {
      if (UPPER.includes(ch)) return randomChar(UPPER);
      if (LOWER.includes(ch)) return randomChar(LOWER);
      if (DIGITS.includes(ch)) return randomChar(DIGITS);
      return ch; // preserve separators: @ . - _ space …
    })
    .join("");
}

function anonymiseNumber(value: number): number {
  /**
   * Integers  → random integer with the same digit count, sign preserved.
   * Floats    → random float with the same decimal places and order of
   *             magnitude, sign preserved.
   *
   * JavaScript has a single `number` type, so we detect floats by checking
   * for a decimal point in the string representation.
   */
  if (!isFinite(value) || isNaN(value)) return value; // keep NaN / Infinity

  const negative = value < 0;
  const absStr = Math.abs(value).toString();

  if (absStr.includes(".")) {
    // ── Float ──────────────────────────────────────────────────────────────
    const decimalPlaces = absStr.split(".")[1].length;
    const integerDigits = Math.max(absStr.split(".")[0].length, 1);
    const high = Math.pow(10, integerDigits);
    const result = parseFloat((Math.random() * high).toFixed(decimalPlaces));
    return negative ? -result : result;
  } else {
    // ── Integer ────────────────────────────────────────────────────────────
    if (value === 0) return 0;
    const digits = absStr.length;
    const low = digits > 1 ? Math.pow(10, digits - 1) : 0; // e.g. 100 for 3-digit
    const high = Math.pow(10, digits) - 1;                  // e.g. 999 for 3-digit
    const result = randomInt(low, high);
    return negative ? -result : result;
  }
}

function anonymiseBoolean(): boolean {
  return Math.random() < 0.5;
}

// ── Core recursive anonymiser ─────────────────────────────────────────────────

function anonymiseValue(value: AnonymisableValue): AnonymisableValue {
  /** Dispatch to the correct anonymiser based on runtime type. */
  if (value === null) return null;

  if (typeof value === "boolean") return anonymiseBoolean(); // ← before number
  if (typeof value === "number") return anonymiseNumber(value);
  if (typeof value === "string") return anonymiseString(value);

  if (Array.isArray(value)) return anonymiseArray(value);

  if (typeof value === "object") return anonymiseObject(value);

  // Fallback — should never be reached given the type constraints above
  return `<unsupported:${typeof value}>`;
}

function anonymiseObject(data: AnonymisableObject): AnonymisableObject {
  /** Anonymise every value in an object; keys are intentionally preserved. */
  return Object.fromEntries(
    Object.entries(data).map(([key, val]) => [key, anonymiseValue(val)])
  );
}

/**
 * Anonymise a list (array) of arbitrary data.
 *
 * Rules
 * -----
 * - string  → same-length string, character class preserved (letter/digit/symbol)
 * - number  → integer: same digit count | float: same decimal places
 * - boolean → random true / false
 * - null    → null  (nothing to anonymise)
 * - object  → recursed; keys kept, values anonymised
 * - array   → recursed
 *
 * @param data - The source array. Can contain any mix of the types above,
 *               nested to any depth.
 * @returns A new array with all primitive values replaced.
 *          The original is never mutated.
 */

function anonymiseArray(data: AnonymisableValue[]): AnonymisableValue[] {
  /** Anonymise every element in an array. */
  return data.map((item) => anonymiseValue(item));
}



export function anonymise(data: AnonymisableValue[]): AnonymisableValue[] {
  if (!Array.isArray(data)) {
    throw new TypeError(`Expected an array, got ${typeof data}.`);
  }
  return anonymiseArray(data);
}
