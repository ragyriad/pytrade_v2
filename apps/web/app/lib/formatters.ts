import type { MoneyBreakdownDto, MoneyDto } from "./portfolio-types";

export function formatMoney(value: MoneyDto): string {
  const amount = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value.amount));

  return `${amount} ${value.currency || "USD"}`;
}

export function formatMoneyBreakdown(
  values: MoneyBreakdownDto[],
  fallback: MoneyDto
): string {
  const formatValue = (value: MoneyDto | MoneyBreakdownDto) =>
    `${new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(value.amount))} ${value.currency || "USD"}`;

  if (values.length === 0) return formatValue(fallback);

  return values.map(formatValue).join("\n");
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value));
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(value)) + "%";
}

export function signedValueClassName(value: number): string {
  if (value > 0) return "text-emerald-700";
  if (value < 0) return "text-rose-700";
  return "text-zinc-950";
}

export function formatDate(value: string | null): string {
  if (!value) return "Not synced";

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = dateOnlyMatch
    ? new Date(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3])
      )
    : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
