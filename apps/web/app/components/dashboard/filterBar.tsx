import { useEffect, useMemo } from "react";
import {
  getSelectableAccounts,
  getUniqueAccountTypes,
  getUniqueAccountSubTypes,
  getUniqueBrokerages,
  type AccountFilterDto,
  type PortfolioFilterState,
} from "../../lib/accountFilters";
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
import { DetailsDropdown } from "../ui/detailsDropdown";
import { SelectField } from "../ui/select";
import { timelineOptions } from "../../services/filter_timeline";

export type CostTypeFilterValue = "both" | "fees" | "taxes";

type FilterBarProps = {
  accounts: AccountFilterDto[];
  value: PortfolioFilterState;
  onChange: (value: PortfolioFilterState) => void;
  /** Presence is the sentinel that enables this costs-only control. */
  costType?: {
    value: CostTypeFilterValue;
    onChange: (value: CostTypeFilterValue) => void;
  };
  show?: Partial<Record<"brokerage" | "account" | "accountType" | "subType" | "registered" | "timeline", boolean>>;
};

type FilterBarMultiSelectProps = {
  label: string;
  icon: typeof faFilter;
  emptyLabel: string;
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (value: string[]) => void;
  className?: string;
};

type AccountFilterOption = {
  value: string;
  label: string;
  accountIds: string[];
};

function accountOptionKey(account: AccountFilterDto): string {
  const normalize = (value: string | null | undefined) =>
    value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";

  // Group records that render as the same logical account. All record IDs are
  // retained in the option, so selecting it still scopes every matching row.
  return [
    normalize(account.institutionName),
    normalize(account.name),
      normalize(account.subType ?? account.type),
    normalize(account.accountCurrency),
  ].join(":");
}

function FilterBarMultiSelect({
  label,
  icon,
  emptyLabel,
  options,
  value,
  onChange,
  className,
}: FilterBarMultiSelectProps) {
  const selected = new Set(value);
  const allSelected = options.length > 0 && options.every((option) => selected.has(option.value));
  const buttonLabel =
    value.length === 0 || allSelected
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
    <div className={`relative max-w-full flex-none ${className ?? ""}`}>
      <div className="mb-1 inline-flex items-center gap-2 text-xs font-medium uppercase text-muted">
        <FontAwesomeIcon icon={icon} className="h-3 w-3" />
        {label}
      </div>
      <DetailsDropdown className="group relative">
        <summary className="app-control-focus flex h-10 w-full cursor-pointer list-none items-center justify-between gap-3 rounded-md border border-border bg-surface px-3 text-left text-sm text-foreground shadow-sm outline-none transition hover:border-interactive-border">
          <span className="min-w-0 truncate">{buttonLabel}</span>
          <span className="flex items-center gap-2">
            {value.length > 0 ? (
              <span className="rounded-full bg-interactive-surface px-2 py-0.5 text-xs font-semibold text-action">
                {value.length}
              </span>
            ) : null}
            <FontAwesomeIcon
              icon={faChevronDown}
              className="h-3 w-3 text-muted transition group-open:rotate-180"
            />
          </span>
        </summary>
        <div className="absolute left-0 z-40 mt-2 max-h-80 w-full min-w-64 overflow-auto rounded-md border border-border bg-surface p-2 shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-border px-2 pb-2">
            <span className="text-xs font-semibold uppercase text-muted">{label}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange(options.map((option) => option.value))}
                disabled={allSelected || options.length === 0}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-action hover:bg-interactive-surface disabled:cursor-default disabled:opacity-50"
              >
                Select All
              </button>
              {value.length > 0 ? (
              <button
                type="button"
                onClick={() => onChange([])}
                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs font-medium text-action hover:bg-interactive-surface"
              >
                <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                Clear
              </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-1">
            {options.map((option) => {
              const checked = selected.has(option.value);

              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm transition ${
                    checked
                      ? "bg-interactive-surface text-action-strong"
                      : "text-foreground hover:bg-surface-muted"
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
                        ? "border-action bg-action text-on-action"
                        : "border-border bg-surface"
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

export function FilterBar({
  accounts,
  value,
  onChange,
  costType,
  show = {},
}: FilterBarProps) {
  const brokerages = useMemo(() => getUniqueBrokerages(accounts), [accounts]);
  const accountTypes = useMemo(() => getUniqueAccountTypes(accounts), [accounts]);
  const accountSubTypes = useMemo(() => getUniqueAccountSubTypes(accounts), [accounts]);
  const selectableAccounts = useMemo(
    () => getSelectableAccounts(accounts, value),
    [accounts, value]
  );
  const accountOptions = useMemo(() => {
    const options = new Map<string, AccountFilterOption>();

    for (const account of selectableAccounts) {
      const value = accountOptionKey(account);
      const existing = options.get(value);
      if (existing) {
        existing.accountIds.push(account.id);
      } else {
        options.set(value, { value, label: account.name, accountIds: [account.id] });
      }
    }

    return Array.from(options.values());
  }, [selectableAccounts]);

  useEffect(() => {
    const selectableIds = new Set(selectableAccounts.map((account) => account.id));
    const nextAccountIds = value.accountIds.filter((accountId) => selectableIds.has(accountId));

    if (nextAccountIds.length !== value.accountIds.length) {
      onChange({ ...value, accountIds: nextAccountIds });
    }
  }, [onChange, selectableAccounts, value]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      {show.brokerage !== false ? <FilterBarMultiSelect
        label="Brokerage"
        icon={faBuildingColumns}
        emptyLabel="All brokerages"
        options={brokerages.map((brokerage) => ({
          value: brokerage,
          label: brokerage,
        }))}
        value={value.brokerages}
        onChange={(brokerages) => onChange({ ...value, brokerages })}
        className="w-fit min-w-48"
      /> : null}

      {show.account !== false ? <FilterBarMultiSelect
        label="Account"
        icon={faFilter}
        emptyLabel="All accounts"
        options={accountOptions}
        value={accountOptions
          .filter((option) => option.accountIds.some((id) => value.accountIds.includes(id)))
          .map((option) => option.value)}
        onChange={(selectedOptions) =>
          onChange({
            ...value,
            accountIds: accountOptions
              .filter((option) => selectedOptions.includes(option.value))
              .flatMap((option) => option.accountIds),
          })
        }
        className="w-fit min-w-64"
      /> : null}

      {show.accountType !== false ? <FilterBarMultiSelect
        label="Account type"
        icon={faLayerGroup}
        emptyLabel="All types"
        options={accountTypes.map((type) => ({
          value: type,
          label: type,
        }))}
        value={value.accountTypes}
        onChange={(accountTypes) => onChange({ ...value, accountTypes })}
        className="w-fit min-w-40"
      /> : null}

      {show.subType !== false ? <FilterBarMultiSelect
        label="Subtype"
        icon={faLayerGroup}
        emptyLabel="All subtypes"
        options={accountSubTypes.map((type) => ({ value: type, label: type }))}
        value={value.subTypes ?? []}
        onChange={(subTypes) => onChange({ ...value, subTypes })}
        className="w-fit min-w-40"
      /> : null}

      {show.registered !== false ? <FilterBarMultiSelect
        label="Registration"
        icon={faFilter}
        emptyLabel="All registration types"
        options={[{ value: "Registered", label: "Registered" }, { value: "Non-registered", label: "Non-registered" }]}
        value={value.registered ?? []}
        onChange={(registered) => onChange({ ...value, registered })}
        className="w-fit min-w-44"
      /> : null}

      {show.timeline !== false ? <SelectField
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
          className="w-auto min-w-36"
        >
          {timelineOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
      </SelectField> : null}

      {costType ? (
        <SelectField
          label={
            <>
              <FontAwesomeIcon icon={faFilter} className="h-3 w-3" />
              Cost type
            </>
          }
          value={costType.value}
          onChange={(event) =>
            costType.onChange(event.target.value as CostTypeFilterValue)
          }
          className="w-auto min-w-32"
        >
          <option value="both">All costs</option>
          <option value="fees">Fees</option>
          <option value="taxes">Taxes</option>
        </SelectField>
      ) : null}
    </div>
  );
}
