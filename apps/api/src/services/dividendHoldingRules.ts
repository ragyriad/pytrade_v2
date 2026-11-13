import type { DividendEvent } from "@repo/db";
import type { MoneyBreakdownDto } from "../shared/money.js";

export const dividendHoldingRules = {
  minimumCurrentYieldPercent: 1,
  minimumRegularPaymentsPerYear: 4,
  excludeSpecialDividends: true,
  inferFrequencyFromTrailingYearWhenMissing: true,
} as const;

const paymentsPerYearByFrequency: Record<string, number> = {
  w: 52,
  weekly: 52,
  bw: 26,
  biweekly: 26,
  "bi-weekly": 26,
  sm: 24,
  semimonthly: 24,
  "semi-monthly": 24,
  bm: 6,
  bimonthly: 6,
  "bi-monthly": 6,
  m: 12,
  monthly: 12,
  q: 4,
  quarterly: 4,
  tm: 3,
  sa: 2,
  semiannual: 2,
  "semi-annual": 2,
  a: 1,
  annual: 1,
  annually: 1,
};

const nonRecurringFrequencies = new Set(["ir", "irregular", "f", "final", "c", "special"]);

export type DividendRate = {
  annualDividendPerShare: number;
  currency: string | null;
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function trailingRegularDividendTotal(events: DividendEvent[]): number {
  const latestDate = new Date(`${String(events[0]?.exDate).slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(latestDate.getTime())) return 0;
  const trailingStart = new Date(latestDate);
  trailingStart.setUTCFullYear(trailingStart.getUTCFullYear() - 1);

  return events
    .filter((event) => {
      const exDate = new Date(`${String(event.exDate).slice(0, 10)}T00:00:00.000Z`);
      return Number.isFinite(exDate.getTime()) && exDate >= trailingStart && exDate <= latestDate;
    })
    .reduce((sum, event) => sum + toNumber(event.cashAmount), 0);
}

function hasQuarterlyOrMoreFrequentSchedule(events: DividendEvent[], frequency: string): boolean {
  if (nonRecurringFrequencies.has(frequency)) return false;
  const paymentsPerYear = paymentsPerYearByFrequency[frequency];
  if (paymentsPerYear != null) {
    return paymentsPerYear >= dividendHoldingRules.minimumRegularPaymentsPerYear;
  }
  if (frequency || !dividendHoldingRules.inferFrequencyFromTrailingYearWhenMissing) return false;

  const latestDate = new Date(`${String(events[0]?.exDate).slice(0, 10)}T00:00:00.000Z`);
  if (!Number.isFinite(latestDate.getTime())) return false;
  const trailingStart = new Date(latestDate);
  trailingStart.setUTCFullYear(trailingStart.getUTCFullYear() - 1);
  const distinctExDates = new Set(events
    .filter((event) => {
      const exDate = new Date(`${String(event.exDate).slice(0, 10)}T00:00:00.000Z`);
      return Number.isFinite(exDate.getTime()) && exDate >= trailingStart && exDate <= latestDate;
    })
    .map((event) => String(event.exDate).slice(0, 10)));
  return distinctExDates.size >= dividendHoldingRules.minimumRegularPaymentsPerYear;
}

export function getRecurringDividendRates(events: DividendEvent[]): Map<string, DividendRate> {
  const eventsBySecurityId = new Map<string, DividendEvent[]>();
  for (const event of events) {
    if (!event.securityId || (dividendHoldingRules.excludeSpecialDividends && event.isSpecial)) continue;
    if (toNumber(event.cashAmount) <= 0) continue;
    eventsBySecurityId.set(event.securityId, [
      ...(eventsBySecurityId.get(event.securityId) ?? []),
      event,
    ]);
  }

  const qualifyingRates = new Map<string, DividendRate>();
  for (const [securityId, unorderedEvents] of eventsBySecurityId) {
    const regularEvents = unorderedEvents.sort((left, right) =>
      String(right.exDate).localeCompare(String(left.exDate))
    );
    const latest = regularEvents[0];
    const frequency = latest.frequency?.trim().toLowerCase() ?? "";
    if (!hasQuarterlyOrMoreFrequentSchedule(regularEvents, frequency)) continue;

    const multiplier = paymentsPerYearByFrequency[frequency];
    const annualDividendPerShare = multiplier != null
      ? toNumber(latest.cashAmount) * multiplier
      : trailingRegularDividendTotal(regularEvents);
    if (annualDividendPerShare <= 0) continue;
    qualifyingRates.set(securityId, {
      annualDividendPerShare,
      currency: latest.currencyCode ?? null,
    });
  }
  return qualifyingRates;
}

export function getQualifyingDividendYieldPercent(
  rate: DividendRate,
  price: MoneyBreakdownDto | null,
  marketCurrency: string
): number | null {
  if (rate.annualDividendPerShare <= 0 || !price || price.amount <= 0) return null;
  const dividendCurrency = rate.currency ?? marketCurrency;
  if (price.currency !== dividendCurrency) return null;

  const yieldPercent = rate.annualDividendPerShare / price.amount * 100;
  return yieldPercent >= dividendHoldingRules.minimumCurrentYieldPercent
    ? yieldPercent
    : null;
}
