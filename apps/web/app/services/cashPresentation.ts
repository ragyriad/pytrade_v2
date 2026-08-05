export function negativeCashClassName(
  value: number,
  fallbackClassName = ""
): string {
  return value < 0 ? "text-negative" : fallbackClassName;
}
