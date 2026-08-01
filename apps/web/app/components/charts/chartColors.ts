export const chartGridColor = "var(--color-chart-grid)";
export const chartAxisColor = "var(--color-chart-axis)";
export const chartSeparatorColor = "var(--color-chart-separator)";

export const chartSeriesColors = [
  "var(--color-chart-series-1)",
  "var(--color-chart-series-2)",
  "var(--color-chart-series-3)",
  "var(--color-chart-series-4)",
  "var(--color-chart-series-5)",
  "var(--color-chart-series-6)",
  "var(--color-chart-series-7)",
  "var(--color-chart-series-8)",
  "var(--color-chart-series-9)",
  "var(--color-chart-series-10)",
  "var(--color-chart-series-11)",
  "var(--color-chart-series-12)",
];

export const chartAccountShareColors = [
  "var(--color-chart-series-1)",
  "var(--color-chart-series-2)",
  "var(--color-chart-series-4)",
  "var(--color-chart-series-5)",
  "var(--color-chart-series-3)",
  "var(--color-chart-series-6)",
  "var(--color-chart-series-7)",
  "var(--color-chart-series-8)",
  "var(--color-chart-series-9)",
  "var(--color-chart-series-10)",
  "var(--color-chart-series-11)",
  "var(--color-chart-series-12)",
];

export const chartAccountColors = [
  "var(--color-chart-account-1)",
  "var(--color-chart-account-2)",
  "var(--color-chart-account-3)",
  "var(--color-chart-account-4)",
  "var(--color-chart-account-5)",
  "var(--color-chart-account-6)",
  "var(--color-chart-account-7)",
  "var(--color-chart-account-8)",
];

export const costFeeCurrencyColors: Record<string, string> = {
  USD: "var(--color-chart-cost-fee-usd)",
  CAD: "var(--color-chart-cost-fee-cad)",
};

export const costTaxCurrencyColors: Record<string, string> = {
  CAD: "var(--color-chart-cost-tax-cad)",
  USD: "var(--color-chart-cost-tax-usd)",
};

export const costFallbackColors = [
  "var(--color-chart-cost-fallback-1)",
  "var(--color-chart-cost-fallback-2)",
  "var(--color-chart-cost-fallback-3)",
  "var(--color-chart-cost-fallback-4)",
];

const dividendFallbackColors = [
  "var(--color-chart-series-1)",
  "var(--color-chart-series-3)",
  "var(--color-chart-series-4)",
  "var(--color-chart-series-6)",
  "var(--color-chart-series-7)",
];

export function dividendCurrencyColor(currency: string, index = 0): string {
  const normalized = currency.trim().toUpperCase();

  if (normalized === "USD") return "var(--color-currency-usd)";
  if (normalized === "CAD") return "var(--color-currency-cad)";

  return dividendFallbackColors[index % dividendFallbackColors.length];
}
