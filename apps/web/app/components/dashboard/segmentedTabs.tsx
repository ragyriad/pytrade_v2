import { buttonClassName } from "../ui/button";

type TabOption<T extends string> = {
  id: T;
  label: string;
  count: number;
};

interface SegmentedTabsProps<T extends string> {
  value: T;
  options: TabOption<T>[];
  onChange: (value: T) => void;
}

export function SegmentedTabs<T extends string>({
  value,
  options,
  onChange,
}: SegmentedTabsProps<T>) {
  return (
    <div className="flex w-full flex-wrap rounded-md border border-border bg-surface-muted p-1 sm:inline-flex sm:w-auto">
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
                ? "bg-surface text-action-strong shadow-sm hover:bg-surface"
                : "text-muted hover:text-action-strong"
              }`
            )}
          >
            {option.label}
            <span className="ml-2 text-xs text-muted">{option.count}</span>
          </button>
        );
      })}
    </div>
  );
}
