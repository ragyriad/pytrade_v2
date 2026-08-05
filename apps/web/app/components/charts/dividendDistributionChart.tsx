"use client";

import { formatMoney } from "../../lib/formatters";
import type { DividendPositionYieldDto } from "../../lib/portfolioTypes";
import { useSessionState } from "../../state/sessionState";
import { chartSeriesColors } from "./chartColors";

type DividendDistributionChartProps = {
  positions: DividendPositionYieldDto[];
};

type DistributionGroup = {
  currency: string;
  rows: Array<{ symbol: string; value: number; percentage: number }>;
};

export function DividendDistributionChart({ positions }: DividendDistributionChartProps) {
  const [display, setDisplay] = useSessionState<"percent" | "value">(
    "dividends:distribution:display",
    "percent"
  );
  const groups = buildDistributionGroups(positions);

  return (
    <section className="app-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <h2 className="text-xl font-semibold text-action">Annual Dividend Distribution</h2>
        <div
          className="inline-flex overflow-hidden rounded-md border border-border"
          role="group"
          aria-label="Dividend distribution display"
        >
          <DisplayButton
            label="%"
            accessibleLabel="Show dividend percentages"
            selected={display === "percent"}
            onClick={() => setDisplay("percent")}
          />
          <DisplayButton
            label="$"
            accessibleLabel="Show dividend amounts"
            selected={display === "value"}
            onClick={() => setDisplay("value")}
          />
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-5 flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
          No annual dividend payouts match this view.
        </div>
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-2">
          {groups.map((group) => (
            <section key={group.currency} aria-labelledby={`distribution-${group.currency}`}>
              <h3
                id={`distribution-${group.currency}`}
                className="text-sm font-semibold text-foreground"
              >
                {group.currency} annual payout
              </h3>
              <div
                className="mt-3 flex h-5 overflow-hidden rounded-sm bg-surface-muted"
                aria-label={`${group.currency} dividend distribution bar`}
              >
                {group.rows.map((row, index) => (
                  <span
                    key={row.symbol}
                    title={`${row.symbol}: ${row.percentage.toFixed(2)}%`}
                    style={{
                      width: `${row.percentage}%`,
                      backgroundColor: chartSeriesColors[index % chartSeriesColors.length],
                    }}
                  />
                ))}
              </div>
              <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                {group.rows.map((row, index) => (
                  <div
                    key={row.symbol}
                    className="grid min-w-0 grid-cols-[10px_1fr_auto] items-center gap-2"
                  >
                    <span
                      className="h-2.5 w-2.5"
                      style={{
                        backgroundColor: chartSeriesColors[index % chartSeriesColors.length],
                      }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm text-foreground">{row.symbol}</span>
                    <span className="text-sm tabular-nums text-content-secondary">
                      {display === "percent"
                        ? `${row.percentage.toFixed(2)}%`
                        : formatMoney({ amount: row.value, currency: group.currency })}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function DisplayButton({
  label,
  accessibleLabel,
  selected,
  onClick,
}: {
  label: string;
  accessibleLabel: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={accessibleLabel}
      aria-pressed={selected}
      onClick={onClick}
      className={`min-w-16 px-5 py-2 text-base font-semibold transition-colors ${
        selected
          ? "bg-accent text-on-action"
          : "bg-inactive-surface text-inactive-text hover:bg-surface-muted"
      }`}
    >
      {label}
    </button>
  );
}

function buildDistributionGroups(
  positions: DividendPositionYieldDto[]
): DistributionGroup[] {
  const totalsByCurrencyAndSymbol = new Map<string, Map<string, number>>();

  for (const position of positions) {
    const { currency } = position.annualizedDividendAmount;
    const value = position.annualizedDividendAmount.amount;
    if (value <= 0) continue;
    const totalsBySymbol = totalsByCurrencyAndSymbol.get(currency) ?? new Map<string, number>();
    totalsBySymbol.set(position.symbol, (totalsBySymbol.get(position.symbol) ?? 0) + value);
    totalsByCurrencyAndSymbol.set(currency, totalsBySymbol);
  }

  return [...totalsByCurrencyAndSymbol.entries()]
    .map(([currency, totalsBySymbol]) => {
      const total = [...totalsBySymbol.values()].reduce((sum, value) => sum + value, 0);
      const rows = [...totalsBySymbol.entries()]
        .map(([symbol, value]) => ({
          symbol,
          value,
          percentage: total > 0 ? (value / total) * 100 : 0,
        }))
        .sort((left, right) => right.value - left.value || left.symbol.localeCompare(right.symbol));
      return { currency, rows };
    })
    .sort((left, right) => left.currency.localeCompare(right.currency));
}
