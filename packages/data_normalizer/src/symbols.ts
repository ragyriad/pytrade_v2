import { SECURITY_ALIAS_RULES } from "./rules/security_aliases.ts";

export { SECURITY_ALIAS_RULES } from "./rules/security_aliases.ts";

export const SYMBOL_TRANSLATIONS = Object.freeze(
  Object.fromEntries(
    SECURITY_ALIAS_RULES
      .filter((rule) => !rule.source)
      .map((rule) => [rule.alias, rule.canonicalSymbol])
  ) as Record<string, string>
);

function cleanSymbol(value: string | null | undefined): string | null {
  const normalized = value
    ?.trim()
    .replace(/^\./, "")
    .replace(/\s+/g, "")
    .toUpperCase();
  return normalized || null;
}

export function canonicalizeSymbol(
  value: string | null | undefined,
  options: { source?: string | null } = {}
): string | null {
  const normalized = cleanSymbol(value);
  if (!normalized) return null;
  const rule = SECURITY_ALIAS_RULES.find(
    (candidate) =>
      candidate.alias === normalized &&
      (!candidate.source || candidate.source === options.source)
  );
  return rule?.canonicalSymbol ?? normalized;
}

export function equivalentSymbols(
  value: string | null | undefined
): string[] {
  const normalized = cleanSymbol(value);
  const canonical = canonicalizeSymbol(normalized);
  if (!canonical) return [];

  const aliases = Object.entries(SYMBOL_TRANSLATIONS)
    .filter(([, target]) => target === canonical)
    .map(([alias]) => alias);
  return [...new Set([canonical, normalized, ...aliases].filter(Boolean))] as string[];
}

const rawSymbolKeys = new Set([
  "symbol",
  "rawsymbol",
  "ticker",
  "underlyingsymbol",
  "optionsymbol",
]);

function symbolString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = cleanSymbol(value);
  if (!normalized) return null;
  if (!/^[A-Z][A-Z0-9.-]{0,49}$/.test(normalized)) return null;
  return normalized;
}

/**
 * Provider-specific JSON shapes vary, so this walks only symbol-labelled
 * fields. It intentionally does not treat arbitrary text as a ticker.
 */
export function extractSymbolsFromRawData(rawData: unknown): string[] {
  const found = new Set<string>();
  const visited = new Set<object>();

  const visit = (value: unknown, parentKey = ""): void => {
    if (value == null) return;
    if (typeof value === "string") {
      if (!rawSymbolKeys.has(parentKey)) return;
      const symbol = symbolString(value);
      if (symbol) found.add(symbol);
      return;
    }
    if (typeof value !== "object" || visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, parentKey);
      return;
    }

    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.replace(/[_-]/g, "").toLowerCase();
      visit(entry, normalizedKey);
    }
  };

  visit(rawData);
  return [...found];
}
