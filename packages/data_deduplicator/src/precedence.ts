export const TRANSACTION_SOURCE_PRIORITY = Object.freeze({
  SNAPTRADE: 300,
  QUESTRADE_STATEMENTS: 200,
  "QUESTRADE LEGACY": 100,
} satisfies Record<string, number>);

export function transactionSourcePriority(
  source: string | null | undefined
): number {
  if (!source) return 0;
  const normalized = source.trim().toUpperCase();
  return TRANSACTION_SOURCE_PRIORITY[
    normalized as keyof typeof TRANSACTION_SOURCE_PRIORITY
  ] ?? 0;
}
