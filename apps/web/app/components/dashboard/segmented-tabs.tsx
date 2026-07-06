import { buttonClassName } from "../ui/button";

type TabOption<T extends string> = {
  id: T;
  label: string;
  count: number;
};

type SegmentedTabsProps<T extends string> = {
  value: T;
  options: TabOption<T>[];
  onChange: (value: T) => void;
};

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <div className="flex w-full flex-wrap rounded-md border border-zinc-200 bg-zinc-50 p-1 sm:inline-flex sm:w-auto">
      {options.map((option) => {
        const active = option.id === value;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={buttonClassName(
              "ghost",
              `min-w-0 flex-1 sm:flex-none ${
              active
                ? "bg-white text-zinc-950 shadow-sm hover:bg-white"
                : "text-zinc-600 hover:text-zinc-950"
              }`
            )}
          >
            {option.label}
            <span className="ml-2 text-xs text-zinc-400">{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}
