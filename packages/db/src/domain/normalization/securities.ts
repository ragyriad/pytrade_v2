import { canonicalizeSymbol, extractSymbolsFromRawData } from "./symbols.js";
import {
  parseOptionContract,
  type ParsedOptionContract,
} from "./options.js";
import {
  SECURITY_PROFILE_RULES,
  type SecurityListingStatus,
} from "./rules/security_profiles.js";

export type CanonicalSecurityType = "ETF" | "ADR" | "STOCK" | "SECURITY" | null;

export type SecurityTypeInput = {
  category?: string | null;
  code?: string | null;
  description?: string | null;
  symbol?: string | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

export function normalizeSecurityType(
  input: SecurityTypeInput
): CanonicalSecurityType {
  const category = normalizeText(input.category);
  const code = normalizeText(input.code);
  const text = normalizeText(
    [input.category, input.code, input.description, input.symbol]
      .filter(Boolean)
      .join(" ")
  );

  // Option contracts are modeled by the options table and transaction action,
  // not as an instrument type on their underlying security.
  if (category === "OPTION" || code === "OPT" || code === "OPTION") return null;
  if (
    category === "ETF" ||
    code === "ETF" ||
    /\bETF\b|EXCHANGE[ -]TRADED FUND/.test(text)
  ) {
    return "ETF";
  }
  if (
    category === "ADR" ||
    code === "ADR" ||
    /\bADR\b|DEPOSITARY RECEIPT|DEPOSITORY RECEIPT|DEPOSITARY SHARE|\bADS\b/.test(text)
  ) {
    return "ADR";
  }
  if (
    category === "STOCK" ||
    ["CS", "EQUITY", "STOCK"].includes(code) ||
    /COMMON STOCK|\bEQUITY\b|\bSHARES?\b|\bSTOCK\b/.test(text)
  ) {
    return "STOCK";
  }
  if (category === "SECURITY" || code === "SECURITY") return "SECURITY";
  return null;
}

const typeWeight: Record<Exclude<CanonicalSecurityType, null>, number> = {
  SECURITY: 1,
  STOCK: 2,
  ADR: 3,
  ETF: 3,
};

export function preferSpecificSecurityType(
  current: string | null | undefined,
  incoming: string | null | undefined
): CanonicalSecurityType {
  const left = normalizeSecurityType({ code: current });
  const right = normalizeSecurityType({ code: incoming });
  if (!left) return right;
  if (!right) return left;
  return typeWeight[right] > typeWeight[left] ? right : left;
}

const disposableDescriptionPhrases = [
  /\bWE ACTED AS AGENT\b/g,
  /\bAVG PRICE\s*-\s*ASK US FOR DETAILS\b/g,
  /\bSPONSORED\b/g,
  /\bAMERICAN DEPOSITARY RECEIPTS?\b/g,
  /\bAMERICAN DEPOSITORY RECEIPTS?\b/g,
  /\bDEPOSITARY SHARES?\b/g,
  /\bDEPOSITORY SHARES?\b/g,
  /\bCOMMON STOCK\b/g,
  /\bCLASS [A-Z]\b/g,
  /\bCL [A-Z]\b/g,
  /\b\d+\s+(?:ADS?\s+)?REPRESENTING\b.*$/g,
  /\bREPSTG\b.*$/g,
  /\bADR\b/g,
  /\bADS\b/g,
];

export function normalizeCompanyDescription(
  value: string | null | undefined
): string {
  let normalized = normalizeText(value)
    .replace(/&/g, " AND ")
    .replace(/\bCORPORATION\b/g, "CORP")
    .replace(/\bINCORPORATED\b/g, "INC")
    .replace(/\bCOMPANY\b/g, "CO")
    .replace(/^THE\b/, " ")
    .replace(/[|(),./-]+/g, " ");
  for (const phrase of disposableDescriptionPhrases) {
    normalized = normalized.replace(phrase, " ");
  }
  return normalized.replace(/\s+/g, " ").trim();
}

export type SecurityResolutionCandidate = {
  id: string;
  securityKey?: string | null;
  source?: string | null;
  symbol: string;
  rawSymbol?: string | null;
  description?: string | null;
  currencyCode?: string | null;
  isArchived?: boolean;
  snaptradeSymbolId?: string | null;
  figiCode?: string | null;
  instrumentTypeCode?: string | null;
  instrumentTypeDescription?: string | null;
};

export type IncomingSecurityReference = {
  symbol?: string | null;
  description?: string | null;
  currencyCode?: string | null;
  instrumentTypeCode?: string | null;
  rawData?: unknown;
};

export type SecurityProfileInput = {
  symbol?: string | null;
  description?: string | null;
  currencyCode?: string | null;
  observedAt?: Date | string | null;
};

export type SecurityIdentityInput = {
  securityKey?: string | null;
  symbol?: string | null;
  rawSymbol?: string | null;
  description?: string | null;
};

export type NormalizedSecurityIdentity = {
  symbol: string | null;
  rawSymbol: string | null;
  optionContract: ParsedOptionContract | null;
};

/**
 * Normalizes the persisted identity fields of a security. Option contract
 * identifiers remain available as raw symbols and option tickers, while the
 * security's display symbol is always the underlying company symbol.
 */
export function normalizeSecurityIdentity(
  input: SecurityIdentityInput
): NormalizedSecurityIdentity {
  const symbol = input.symbol?.trim() || null;
  const rawSymbol = input.rawSymbol?.trim() || null;
  const keyTicker = input.securityKey?.startsWith("option:")
    ? input.securityKey.slice("option:".length)
    : null;
  const optionContract = parseOptionContract(
    input.description,
    rawSymbol,
    symbol,
    keyTicker
  );

  if (optionContract) {
    return {
      symbol: optionContract.underlyingSymbol,
      rawSymbol: rawSymbol ?? symbol ?? optionContract.ticker,
      optionContract,
    };
  }

  return {
    symbol: canonicalizeSymbol(symbol),
    rawSymbol,
    optionContract: null,
  };
}

export type NormalizedSecurityProfile = {
  symbol: string;
  description: string;
  currencyCode: string;
  exchangeCode: string;
  exchangeMicCode: string;
  exchangeName: string;
  listingStatus: SecurityListingStatus;
  delistedAt: string | null;
};

function dateOnly(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const match = value.trim().match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

/**
 * Resolves reviewed exchange-scoped issuer identities. A date-bounded match
 * allows old statement rows to be repaired even when a provider supplied the
 * current company that now uses the same ticker.
 */
export function normalizeSecurityProfile(
  input: SecurityProfileInput
): NormalizedSecurityProfile | null {
  const symbol = canonicalizeSymbol(input.symbol);
  const currencyCode = normalizeText(input.currencyCode);
  const description = input.description?.trim() ?? "";
  const observedAt = dateOnly(input.observedAt);

  const rule = SECURITY_PROFILE_RULES.find((candidate) => {
    if (symbol !== candidate.symbol) return false;
    if (candidate.descriptionPattern.test(description)) return true;
    if (currencyCode !== candidate.currencyCode) return false;
    return Boolean(
      observedAt &&
        candidate.delistedAt &&
        observedAt <= candidate.delistedAt
    );
  });
  if (!rule) return null;

  return {
    symbol: rule.symbol,
    description: rule.description,
    currencyCode: rule.currencyCode,
    exchangeCode: rule.exchangeCode,
    exchangeMicCode: rule.exchangeMicCode,
    exchangeName: rule.exchangeName,
    listingStatus: rule.listingStatus,
    delistedAt: rule.delistedAt,
  };
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(left.split(" ").filter((token) => token.length > 1));
  const rightTokens = new Set(right.split(" ").filter((token) => token.length > 1));
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(leftTokens.size, rightTokens.size);
}

function candidateQuality(candidate: SecurityResolutionCandidate): number {
  return (
    (normalizeText(candidate.source) === "SNAPTRADE" ? 8 : 0) +
    (candidate.securityKey?.startsWith("snaptrade:") ? 5 : 0) +
    (candidate.snaptradeSymbolId ? 4 : 0) +
    (candidate.figiCode ? 3 : 0)
  );
}

export function resolveSecurityCandidate(
  input: IncomingSecurityReference,
  candidates: SecurityResolutionCandidate[]
): SecurityResolutionCandidate | null {
  const rawSymbols = [
    input.symbol,
    ...extractSymbolsFromRawData(input.rawData),
  ];
  const symbols = new Set(
    rawSymbols
      .map((symbol) => canonicalizeSymbol(symbol))
      .filter((value): value is string => Boolean(value))
  );
  const description = normalizeCompanyDescription(input.description);
  const currency = normalizeText(input.currencyCode);
  const scored = candidates
    .filter((candidate) => {
      if (candidate.isArchived) return false;
      // Contract securities exist only to support the options-table foreign
      // key and must never win a normal company-security lookup.
      if (candidate.securityKey?.startsWith("option:")) return false;
      return true;
    })
    .map((candidate) => {
      const candidateSymbols = [
        canonicalizeSymbol(candidate.symbol),
        canonicalizeSymbol(candidate.rawSymbol),
      ].filter((value): value is string => Boolean(value));
      const symbolMatch = candidateSymbols.some((symbol) => symbols.has(symbol));
      const candidateDescription = normalizeCompanyDescription(candidate.description);
      const exactDescription =
        description.length >= 5 && description === candidateDescription;
      const containedDescription =
        description.length >= 5 &&
        candidateDescription.length >= 5 &&
        (description.includes(candidateDescription) ||
          candidateDescription.includes(description));
      const similarity =
        description.length >= 5 && candidateDescription.length >= 5
          ? tokenSimilarity(description, candidateDescription)
          : 0;
      let score = symbolMatch
        ? 1000
        : exactDescription
          ? 800
          : containedDescription
            ? 760
            : similarity >= 0.8
              ? 700
              : 0;
      if (
        currency &&
        candidate.currencyCode &&
        normalizeText(candidate.currencyCode) !== currency
      ) {
        score -= 200;
      }
      score += candidateQuality(candidate);
      return { candidate, score };
    })
    .filter(({ score }) => score >= 700)
    .sort((left, right) => right.score - left.score);

  const first = scored[0];
  if (!first) return null;
  const second = scored[1];
  if (
    second &&
    first.score === second.score &&
    canonicalizeSymbol(first.candidate.symbol) !==
      canonicalizeSymbol(second.candidate.symbol)
  ) {
    return null;
  }
  return first.candidate;
}
