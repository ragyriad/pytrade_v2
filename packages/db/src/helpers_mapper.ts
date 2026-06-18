export function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

export function safeNumeric(value: unknown): string | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n.toString();
}