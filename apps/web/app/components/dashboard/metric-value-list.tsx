type MetricValueRow = {
  id: string;
  value: string;
  suffix?: string;
};

type MetricValueListProps = {
  rows: MetricValueRow[];
  emptyValue?: string;
};

export function MetricValueList({ rows, emptyValue = "-" }: MetricValueListProps) {
  if (rows.length === 0) {
    return <span>{emptyValue}</span>;
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {rows.map((row) => (
        <span key={row.id} className="inline-flex items-baseline justify-center gap-1">
          <span>{row.value}</span>
          {row.suffix ? (
            <span className="text-sm font-medium uppercase tracking-normal text-zinc-500">
              {row.suffix}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  );
}
