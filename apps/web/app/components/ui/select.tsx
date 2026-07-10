import type { ReactNode, SelectHTMLAttributes } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  children: ReactNode;
};

export function SelectField({ label, children, className = "", ...props }: SelectFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium uppercase text-muted">
      <span className="inline-flex items-center gap-2">{label}</span>
      <select
        className={`app-control-focus h-10 min-w-48 rounded-md border border-border bg-surface px-3 text-sm normal-case text-foreground outline-none transition ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
