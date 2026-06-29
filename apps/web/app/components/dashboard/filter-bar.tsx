import { useEffect, useMemo } from "react";
import {
  getSelectableAccounts,
  getUniqueAccountTypes,
  getUniqueBrokerages,
  type PortfolioFilterState,
} from "../../lib/account-filters";
import type { AccountDto } from "../../lib/portfolio-types";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBuildingColumns,
  faCalendarDays,
  faCheck,
  faChevronDown,
  faFilter,
  faLayerGroup,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { DetailsDropdown } from "../ui/details-dropdown";
import { SelectField } from "../ui/select";
import { timelineOptions } from "../../services/filter_timeline";

type FilterBarProps = {
  accounts: AccountDto[];
  value: PortfolioFilterState;
  onChange: (value: PortfolioFilterState) => void;
};

type FilterBarMultiSelectProps = {
  label: string;
  icon: typeof faFilter;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
};

function FilterBarMultiSelect({
  label,
  icon,
  emptyLabel,
  options,
  value,
  onChange,
}: FilterBarMultiSelectProps) {
  const selected = new Set(value);
  const buttonLabel =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? options.find((option) => option.value === value[0])?.label ?? value[0]
        : `${value.length} selected`;

  const toggleValue = (nextValue: string) => {
    onChange(
      selected.has(nextValue)
        ? value.filter((item) => item !== nextValue)
        : [...value, nextValue]
    );
  };

  return (
    <div className="relative min-w-0">
      <div className="mb-1 inline-flex items-center gap-2 text-xs font-medium uppercase text-zinc-500">
        <FontAwesomeIcon icon={icon} className="h-3 w-3" />
        {label}
      </div>
      <DetailsDropdown className="group relative">
        <summary className="flex h-10 w-full cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-3 text-left text-sm text-zinc-950 shadow-sm outline-none transition hover:border-zinc-300 group-open:border-emerald-600 group-open:ring-2 group-open:ring-emerald-600/20">
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <span className="flex items-center gap-2">
            {value.length > 0 ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                {value.length}
              </span>
            ) : null}
            <FontAwesomeIcon
              icon={faChevronDown}
              className="h-3 w-3 text-zinc-400 transition group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="absolute left-0 z-40 mt-2 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-zinc-200 bg-white p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-100 px-2 pb-2">
            <span className="text-xs font-semibold uppercase text-zinc-500">{label}</span>
            {value.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                Clear
              </button>
            ) : null}
          </div>
          <div className="grid gap-1">
            {options.map((option) => {
              const checked = selected.has(option.value);

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm transition ${
                    checked
                      ? "bg-emerald-50 text-emerald-950"
                      : "text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleValue(option.value)}
                    className="sr-only"
                  />
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      checked
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-zinc-300 bg-white"
                    }`}
                  >
                    {checked ? <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className="min-w-0 truncate">{option.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      </DetailsDropdown>
    </div>
  );
}

export function FilterBar({ accounts, value, onChange }: FilterBarProps) {
  const brokerages = useMemo(() => getUniqueBrokerages(accounts), [accounts]);
  const accountTypes = useMemo(() => getUniqueAccountTypes(accounts), [accounts]);
  const selectableAccounts = useMemo(
    () => getSelectableAccounts(accounts, value),
    [accounts, value]
  );

  useEffect(() => {
    const selectableIds = new Set(selectableAccounts.map((account) => account.id));
    const nextAccountIds = value.accountIds.filter((accountId) => selectableIds.has(accountId));

    if (nextAccountIds.length !== value.accountIds.length) {
      onChange({ ...value, accountIds: nextAccountIds });
    }
  }, [onChange, selectableAccounts, value]);

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_11rem]">
      <FilterBarMultiSelect
        label="Brokerage"
        icon={faBuildingColumns}
        emptyLabel="All brokerages"
        options={brokerages.map((brokerage) => ({
          value: brokerage,
          label: brokerage,
        }))}
        value={value.brokerages}
        onChange={(brokerages) => onChange({ ...value, brokerages })}
      />

      <FilterBarMultiSelect
        label="Account"
        icon={faFilter}
        emptyLabel="All accounts"
        options={selectableAccounts.map((account) => ({
          value: account.id,
          label: account.name,
        }))}
        value={value.accountIds}
        onChange={(accountIds) => onChange({ ...value, accountIds })}
      />

      <FilterBarMultiSelect
        label="Account type"
        icon={faLayerGroup}
        emptyLabel="All types"
        options={accountTypes.map((type) => ({
          value: type,
          label: type,
        }))}
        value={value.accountTypes}
        onChange={(accountTypes) => onChange({ ...value, accountTypes })}
      />

      <SelectField
        label={
          <>
          <FontAwesomeIcon icon={faCalendarDays} className="h-3 w-3" />
          Timeline
          </>
        }
          value={value.timeline}
          onChange={(event) =>
            onChange({ ...value, timeline: event.target.value as typeof value.timeline })
          }
          className="w-full min-w-0 sm:w-40"
        >
          {timelineOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </SelectField>
    </div>
  );
}
