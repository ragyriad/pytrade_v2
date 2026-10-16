import { canonicalizeSymbol } from "./symbols.js";

export type ParsedOptionContract = {
  underlyingSymbol: string;
  rawUnderlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string;
  ticker: string;
};

const months: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

const spacedOptionPattern =
  /\b([A-Z][A-Z0-9.-]{0,9})\s+(\d{1,2}[A-Z]{3}\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(PUTS?|CALLS?)\s+\$?(\d+(?:\.\d+)?)\b/i;
const sideFirstOptionPattern =
  /\b(PUTS?|CALLS?)\s+([A-Z][A-Z0-9.-]{0,9})\s+(\d{1,2}[A-Z]{3}\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+\$?(\d+(?:\.\d+)?)\b/i;

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseOptionDate(
  value: string | null | undefined
): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;

  const iso = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
    return validDate(year, Number(slash[1]), Number(slash[2]));
  }

  const named = normalized.match(/^(\d{1,2})([A-Z]{3})(\d{2}|\d{4})$/);
  if (named) {
    const month = months[named[2]];
    const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3]);
    return month ? validDate(year, Number(month), Number(named[1])) : null;
  }

  return null;
}

export function formatOccTicker(input: {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string | number;
}): string {
  const [year, month, day] = input.expirationDate.split("-");
  const side = input.contractType === "CALL" ? "C" : "P";
  const strike = Math.round(Number(input.strikePrice) * 1000)
    .toString()
    .padStart(8, "0");
  return `${input.underlyingSymbol}${year.slice(2)}${month}${day}${side}${strike}`;
}

/**
 * Removes the contract portion of a readable option description while
 * retaining any provider-supplied underlying company name.
 */
export function optionUnderlyingDescription(
  value: string | null | undefined
): string | null {
  if (!value?.trim()) return null;
  const withoutContract = value
    .replace(new RegExp(sideFirstOptionPattern.source, "ig"), " ")
    .replace(new RegExp(spacedOptionPattern.source, "ig"), " ")
    .replace(/[()[\]|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutContract || null;
}

function buildContract(input: {
  underlyingSymbol: string;
  expirationDate: string;
  contractType: "CALL" | "PUT";
  strikePrice: string | number;
}): ParsedOptionContract | null {
  const rawUnderlyingSymbol = input.underlyingSymbol.replace(/^\./, "").toUpperCase();
  const underlyingSymbol = canonicalizeSymbol(rawUnderlyingSymbol);
  const strike = Number(input.strikePrice);
  if (!underlyingSymbol || !Number.isFinite(strike)) return null;
  const strikePrice = strike.toFixed(6);
  return {
    underlyingSymbol,
    rawUnderlyingSymbol,
    expirationDate: input.expirationDate,
    contractType: input.contractType,
    strikePrice,
    ticker: formatOccTicker({
      underlyingSymbol,
      expirationDate: input.expirationDate,
      contractType: input.contractType,
      strikePrice,
    }),
  };
}

function parseSide(value: string): "CALL" | "PUT" {
  return value.startsWith("C") ? "CALL" : "PUT";
}

/**
 * Accepts OCC tickers, Questrade's compact option strings, and clear
 * descriptions such as "(CNQ 2022-04-14 CALL 55)".
 */
export function parseOptionContract(
  ...values: Array<string | null | undefined>
): ParsedOptionContract | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (!normalized) continue;
    const compact = normalized.replace(/\s+/g, "");

    const occ = compact.match(/^([A-Z]{1,10})(\d{6})([CP])(\d{8})$/);
    if (occ) {
      const expirationDate = parseOptionDate(
        `${2000 + Number(occ[2].slice(0, 2))}-${occ[2].slice(2, 4)}-${occ[2].slice(4, 6)}`
      );
      if (expirationDate) {
        const parsed = buildContract({
          underlyingSymbol: occ[1],
          expirationDate,
          contractType: parseSide(occ[3]),
          strikePrice: Number(occ[4]) / 1000,
        });
        if (parsed) return parsed;
      }
    }

    const compactNamed = compact.match(
      /^([A-Z]{1,10})(\d{1,2}[A-Z]{3}\d{2})([CP])(\d+(?:\.\d+)?)$/
    );
    if (compactNamed) {
      const expirationDate = parseOptionDate(compactNamed[2]);
      if (expirationDate) {
        const parsed = buildContract({
          underlyingSymbol: compactNamed[1],
          expirationDate,
          contractType: parseSide(compactNamed[3]),
          strikePrice: compactNamed[4],
        });
        if (parsed) return parsed;
      }
    }

    const spaced = normalized.match(spacedOptionPattern);
    if (spaced) {
      const expirationDate = parseOptionDate(spaced[2]);
      if (expirationDate) {
        const parsed = buildContract({
          underlyingSymbol: spaced[1],
          expirationDate,
          contractType: parseSide(spaced[3]),
          strikePrice: spaced[4],
        });
        if (parsed) return parsed;
      }
    }

    const sideFirst = normalized.match(sideFirstOptionPattern);
    if (sideFirst) {
      const expirationDate = parseOptionDate(sideFirst[3]);
      if (expirationDate) {
        const parsed = buildContract({
          underlyingSymbol: sideFirst[2],
          expirationDate,
          contractType: parseSide(sideFirst[1]),
          strikePrice: sideFirst[4],
        });
        if (parsed) return parsed;
      }
    }
  }
  return null;
}
