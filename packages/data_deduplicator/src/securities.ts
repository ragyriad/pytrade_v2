export type SecurityDuplicateCandidate = {
  id: string;
  canonicalSymbol: string;
  storedSymbol: string;
  canonicalType: string | null;
  isSynthetic: boolean;
  hasProviderId: boolean;
  hasFigi: boolean;
  hasExchange: boolean;
  transactionCount: number;
  aliasCount: number;
};

export type SecurityDuplicatePlan = {
  canonicalSymbol: string;
  canonicalType: string | null;
  keeperId: string;
  duplicateIds: string[];
};

function securityTypeRank(type: string | null): number {
  if (type === "ETF") return 2;
  if (type === "STOCK") return 1;
  return 0;
}

function candidateScore(
  candidate: SecurityDuplicateCandidate,
  targetSymbol: string,
  targetType: string | null
): number {
  return [
    candidate.storedSymbol === targetSymbol ? 40 : 0,
    candidate.canonicalType === targetType ? 24 : 0,
    !candidate.isSynthetic ? 12 : 0,
    candidate.hasProviderId ? 8 : 0,
    candidate.hasFigi ? 6 : 0,
    candidate.hasExchange ? 3 : 0,
    Math.min(candidate.transactionCount, 5),
    Math.min(candidate.aliasCount, 3),
  ].reduce((sum, value) => sum + value, 0);
}

/**
 * Plans security merges without touching storage. The importer supplies
 * already-normalized identity fields; this package owns grouping and winner
 * selection so every caller uses the same deterministic policy.
 */
export function planSecurityDuplicates(
  candidates: SecurityDuplicateCandidate[]
): SecurityDuplicatePlan[] {
  const groups = new Map<string, SecurityDuplicateCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.canonicalSymbol) ?? [];
    group.push(candidate);
    groups.set(candidate.canonicalSymbol, group);
  }

  return [...groups.entries()].map(([canonicalSymbol, group]) => {
    const canonicalType = [...group]
      .map((candidate) => candidate.canonicalType)
      .sort((left, right) => securityTypeRank(right) - securityTypeRank(left))[0];
    const keeper = [...group].sort((left, right) => {
      const scoreDifference =
        candidateScore(right, canonicalSymbol, canonicalType) -
        candidateScore(left, canonicalSymbol, canonicalType);
      if (scoreDifference !== 0) return scoreDifference;
      return left.id.localeCompare(right.id);
    })[0];

    return {
      canonicalSymbol,
      canonicalType,
      keeperId: keeper.id,
      duplicateIds: group
        .filter((candidate) => candidate.id !== keeper.id)
        .map((candidate) => candidate.id),
    };
  });
}
