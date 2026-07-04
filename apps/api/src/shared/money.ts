export type MoneyDto = {
  amount: number;
  currency: string;
};

export type MoneyBreakdownDto = {
  currency: string;
  amount: number;
};

export function toMoneyDto(
  amount: number,
  currency: string | null | undefined,
  fallbackCurrency = "USD"
): MoneyDto {
  return {
    amount,
    currency: currency || fallbackCurrency,
  };
}
