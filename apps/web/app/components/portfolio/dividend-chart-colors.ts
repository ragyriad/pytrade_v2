const fallbackColors = ["#2f6f9f", "#b45309", "#7c3aed", "#0891b2", "#4f46e5"];

export function dividendCurrencyColor(currency: string, index = 0): string {
  const normalized = currency.trim().toUpperCase();

  if (normalized === "USD") return "#047857";
  if (normalized === "CAD") return "#be123c";

  return fallbackColors[index % fallbackColors.length];
}
