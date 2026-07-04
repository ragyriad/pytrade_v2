export function toFiniteNumber(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function toRequiredFiniteNumber(
  value: number | string | null | undefined,
  label: string
): number {
  const parsed = toFiniteNumber(value);
  if (parsed == null) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

export function toFixedNumericString(value: number | null): string | null {
  return value == null ? null : value.toFixed(6);
}
