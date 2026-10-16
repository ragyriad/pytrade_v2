export type SecurityListingStatus = "ACTIVE" | "DELISTED";

export type SecurityProfileRule = {
  symbol: string;
  currencyCode: string;
  description: string;
  exchangeCode: string;
  exchangeMicCode: string;
  exchangeName: string;
  listingStatus: SecurityListingStatus;
  delistedAt: string | null;
  descriptionPattern: RegExp;
};

/**
 * Durable issuer identities that cannot be resolved safely from a ticker alone.
 * Tickers are exchange-scoped and may be reused by unrelated companies.
 */
export const SECURITY_PROFILE_RULES = Object.freeze([
  {
    symbol: "DOC",
    currencyCode: "CAD",
    description: "CloudMD Software & Services Inc.",
    exchangeCode: "TSXV",
    exchangeMicCode: "XTSX",
    exchangeName: "TSX Venture Exchange",
    listingStatus: "DELISTED",
    delistedAt: "2024-07-10",
    descriptionPattern: /\bCLOUD\s*MD\b|\bCLOUDMD\b/i,
  },
] satisfies SecurityProfileRule[]);
