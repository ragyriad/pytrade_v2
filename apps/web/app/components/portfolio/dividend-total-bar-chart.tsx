import { useEffect, useState } from "react";
import { formatMoney } from "../../lib/formatters";
import type { MoneyBreakdownDto } from "../../lib/portfolio-types";
import { dividendCurrencyColor } from "./dividend-chart-colors";

type DividendTotalBarChartProps = {
  totals: MoneyBreakdownDto[];
};

type ChartRow = {
  currency: string;
  amount: number;
};

function AnimatedMoneyValue({ row }: { row: ChartRow }) {
  const [amount, setAmount] = useState(0);

  useEffect(() => {
    let frame = 0;
    let animationFrameId = 0;
    const totalFrames = 34;

    const tick = () => {
      frame += 1;
      const progress = Math.min(frame / totalFrames, 1);
      const eased = 1 - (1 - progress) ** 3;
      setAmount(row.amount * eased);

      if (progress < 1) {
        animationFrameId = window.requestAnimationFrame(tick);
      }
    };

    setAmount(0);
    animationFrameId = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [row.amount]);

  return <>{formatMoney({ amount, currency: row.currency })}</>;
}

export function DividendTotalBarChart({ totals }: DividendTotalBarChartProps) {
  const rows: ChartRow[] = totals.map((total) => ({
    currency: total.currency,
    amount: Math.abs(total.amount),
  }));
  const maxAmount = Math.max(1, ...rows.map((row) => row.amount));

  return (
    <section className="app-panel p-4">
      <style>
        {`@keyframes dividend-total-bar-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}
      </style>
      <div>
        {rows.length === 0 ? (
          <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No dividend totals match this view.
          </div>
        ) : (
          <div className="grid gap-3">
            {rows.map((row, index) => (
              <div key={row.currency} className="grid gap-1.5">
                <div className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="font-semibold text-foreground">{row.currency}</span>
                  <span className="font-semibold text-foreground">
                    <AnimatedMoneyValue row={row} />
                  </span>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-surface-muted">
                  <div
                    key={`${row.currency}-${row.amount}`}
                    className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{
                      width: `${Math.max(8, (row.amount / maxAmount) * 100)}%`,
                      backgroundColor: dividendCurrencyColor(row.currency, index),
                      transformOrigin: "left",
                      animation: "dividend-total-bar-grow 700ms ease-out both",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
