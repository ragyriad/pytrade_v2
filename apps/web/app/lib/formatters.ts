import type { MoneyBreakdownDto, MoneyDto } from "./portfolio-types";

export function formatMoney(value: MoneyDto): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: value.currency || "USD",
    currencyDisplay: "code",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value.amount);
}

export function formatMoneyBreakdown(
  values: MoneyBreakdownDto[],
  fallback: MoneyDto
): string {
  if (values.length === 0) return formatMoney(fallback);

  return values.map((value) => formatMoney(value)).join(" + ");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value) + "%";
}

export function signedValueClassName(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-zinc-950";
}

export function formatDate(value: string | null): string {
  if (!value) return "Not synced";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function normalizeAccountType(type: string | null): string {
  const normalized = type?.toLowerCase().replace(/[_-]/g, " ") ?? "";

  if (normalized.includes("tfsa")) return "TFSA";
  if (normalized.includes("fhsa")) return "FHSA";
  if (normalized.includes("rrsp")) return "RRSP";
  if (normalized.includes("non registered")) return "Non registered";
  if (normalized.includes("cash") || normalized.includes("msb")) return "Non registered";

  return type?.trim() || "Other";
}
