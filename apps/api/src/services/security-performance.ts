export type MoneyValue = {
  amount: number;
  currency: string;
};

export function buildSecurityGainLoss(
  amount: number,
  currency: string | null | undefined
): MoneyValue {
  return {
    amount,
    currency: currency || "USD",
  };
}
