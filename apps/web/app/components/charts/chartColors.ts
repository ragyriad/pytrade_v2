export const chartGridColor = "var(--color-chart-grid)";
export const chartAxisColor = "var(--color-chart-axis)";
export const chartSeparatorColor = "var(--color-chart-separator)";
export const chartAxisTick = { fill: chartAxisColor, fontSize: 12 } as const;
export const chartAxisLine = { stroke: chartGridColor } as const;
export const chartTickLine = { stroke: chartGridColor } as const;
export const chartTooltipContentStyle = {
  backgroundColor: "var(--color-surface)",
  borderColor: "var(--color-border)",
  borderRadius: "0.375rem",
  boxShadow: "var(--shadow-panel)",
  color: "var(--color-foreground)",
} as const;
export const chartTooltipLabelStyle = {
  color: "var(--color-foreground)",
} as const;

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
  "var(--color-chart-series-1)",
  "var(--color-chart-series-2)",
  "var(--color-chart-series-3)",
  "var(--color-chart-series-5)",
  "var(--color-chart-series-4)",
  "var(--color-chart-series-6)",
  "var(--color-chart-series-10)",
  "var(--color-chart-series-7)",
];

const currencyFallbackColors = [
  "var(--color-chart-series-1)",
  "var(--color-chart-series-3)",
  "var(--color-chart-series-4)",
  "var(--color-chart-series-6)",
  "var(--color-chart-series-7)",
];

export function chartCurrencyColor(currency: string, index = 0): string {
  const normalized = currency.trim().toUpperCase();

  if (normalized === "USD") return "var(--color-currency-usd)";
  if (normalized === "CAD") return "var(--color-currency-cad)";

  return currencyFallbackColors[index % currencyFallbackColors.length];
}
