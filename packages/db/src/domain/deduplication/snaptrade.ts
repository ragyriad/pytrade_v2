export type SnapTradeCashActivityLike = {
  id?: string | null;
  external_reference_id?: string | null;
  type?: string | null;
  description?: string | null;
  amount?: string | number | null;
  units?: string | number | null;
  price?: string | number | null;
  fee?: string | number | null;
  trade_date?: string | Date | null;
  settlement_date?: string | Date | null;
  currency?: { code?: string | null } | null;
  symbol?: { id?: string | null; symbol?: string | null } | null;
};

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function normalizeNumber(value: string | number | null | undefined): string {
  if (value == null) return "";
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  if (Object.is(parsed, -0) || parsed === 0) return "0";
  return parsed.toString();
}

function normalizeDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

export function snaptradeCashActivityFingerprint(
  activity: SnapTradeCashActivityLike
): string {
  return [
    normalizeDate(activity.trade_date),
    normalizeDate(activity.settlement_date),
    normalizeText(activity.external_reference_id),
    normalizeText(activity.type),
    normalizeText(activity.description),
    normalizeNumber(activity.amount),
    normalizeText(activity.currency?.code),
    normalizeText(activity.symbol?.id ?? activity.symbol?.symbol),
    normalizeNumber(activity.units),
    normalizeNumber(activity.price),
    normalizeNumber(activity.fee),
  ].join("|");
}

export function deduplicateSnaptradeCashActivities<
  TActivity extends SnapTradeCashActivityLike,
>(activities: TActivity[]): { activities: TActivity[]; skipped: number } {
  const byFingerprint = new Map<string, TActivity>();
  for (const activity of activities) {
    const fingerprint = snaptradeCashActivityFingerprint(activity);
    const current = byFingerprint.get(fingerprint);
    const currentId = current?.id ?? "";
    const candidateId = activity.id ?? "";
    if (!current || (candidateId && (!currentId || candidateId < currentId))) {
      byFingerprint.set(fingerprint, activity);
    }
  }
  return {
    activities: [...byFingerprint.values()],
    skipped: activities.length - byFingerprint.size,
  };
}
