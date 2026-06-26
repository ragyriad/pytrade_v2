import type { MoneyBreakdownDto, MoneyDto } from "../lib/portfolio-types";

export function groupMoney(values: MoneyDto[]): MoneyBreakdownDto[] {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return Array.from(totals.entries()).map(([currency, amount]) => ({ currency, amount }));
}

export function absoluteMoney(value: MoneyDto): MoneyDto {
  return {
    ...value,
    amount: Math.abs(value.amount),
  };
}

export function divideMoney(values: MoneyBreakdownDto[], divisor: number): MoneyBreakdownDto[] {
  return values.map((value) => ({
    currency: value.currency,
    amount: divisor === 0 ? 0 : value.amount / divisor,
  }));
}
