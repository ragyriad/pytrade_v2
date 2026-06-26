import { formatMoney } from "../../lib/formatters";
import type { AllocationDto } from "../../lib/portfolio-types";

type AllocationListProps = {
  title: string;
  rows: AllocationDto[];
  currency: string;
};

export function AllocationList({ title, rows, currency }: AllocationListProps) {
  return (
    <section className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <div className="mt-5 space-y-4">
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No allocation data.</p>
        ) : (
          rows.slice(0, 6).map((row) => (
            <div key={row.label}>
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="truncate font-medium text-zinc-800">{row.label}</span>
                <span className="shrink-0 text-zinc-500">
                  {row.percentage.toFixed(1)}%
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-4 text-xs text-zinc-500">
                <span>{formatMoney({ amount: row.value, currency })}</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-sm bg-zinc-100">
                <div
                  className="h-full rounded-sm bg-emerald-600"
                  style={{ width: `${Math.min(row.percentage, 100)}%` }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
