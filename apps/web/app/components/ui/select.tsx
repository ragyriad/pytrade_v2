import type { ReactNode, SelectHTMLAttributes } from "react";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: ReactNode;
  children: ReactNode;
};

export function SelectField({ label, children, className = "", ...props }: SelectFieldProps) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium uppercase text-zinc-500">
      <span className="inline-flex items-center gap-2">{label}</span>
      <select
        className={`h-10 min-w-48 rounded-md border border-zinc-200 bg-white px-3 text-sm normal-case text-zinc-950 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20 ${className}`}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}
