export type SecurityAliasRule = {
  alias: string;
  canonicalSymbol: string;
  kind: "SYMBOL_CHANGE" | "SOURCE_PARSE_CORRECTION";
  source?: "Questrade Legacy";
  reason: string;
};

/**
 * Durable, reviewed identity decisions. Provider UUIDs and automatically
 * observed aliases remain database data and are intentionally excluded.
 */
export const SECURITY_ALIAS_RULES = Object.freeze([
  {
    alias: "SNE",
    canonicalSymbol: "SONY",
    kind: "SYMBOL_CHANGE",
    reason: "Sony changed its US-listed ticker from SNE to SONY.",
  },
  {
    alias: "SQ",
    canonicalSymbol: "XYZ",
    kind: "SYMBOL_CHANGE",
    reason: "Block changed its ticker from SQ to XYZ.",
  },
  {
    alias: "FB",
    canonicalSymbol: "META",
    kind: "SYMBOL_CHANGE",
    reason: "Meta Platforms changed its ticker from FB to META.",
  },
  {
    alias: "V005059",
    canonicalSymbol: "VALE",
    kind: "SOURCE_PARSE_CORRECTION",
    source: "Questrade Legacy",
    reason: "Legacy Questrade extraction identifier for Vale.",
  },
] satisfies SecurityAliasRule[]);
