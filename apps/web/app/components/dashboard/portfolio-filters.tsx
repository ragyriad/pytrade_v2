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
  faFilter,
  faLayerGroup,
} from "@fortawesome/free-solid-svg-icons";
import { SelectField } from "../ui/select";
import { timelineOptions } from "../../business/timeline";

type PortfolioFiltersProps = {
  accounts: AccountDto[];
  value: PortfolioFilterState;
  onChange: (value: PortfolioFilterState) => void;
};

export function PortfolioFilters({ accounts, value, onChange }: PortfolioFiltersProps) {
  const brokerages = getUniqueBrokerages(accounts);
  const accountTypes = getUniqueAccountTypes(accounts);
  const selectableAccounts = getSelectableAccounts(accounts, value);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <SelectField
        label={
          <>
          <FontAwesomeIcon icon={faBuildingColumns} className="h-3 w-3" />
          Brokerage
          </>
        }
          value={value.brokerage}
          onChange={(event) =>
            onChange({ ...value, brokerage: event.target.value, accountId: "all" })
          }
          className="w-full min-w-0 sm:w-52"
        >
          <option value="all">All brokerages</option>
          {brokerages.map((brokerage) => (
            <option key={brokerage} value={brokerage}>
              {brokerage}
            </option>
          ))}
      </SelectField>

      <SelectField
        label={
          <>
          <FontAwesomeIcon icon={faFilter} className="h-3 w-3" />
          Account
          </>
        }
          value={value.accountId}
          onChange={(event) => onChange({ ...value, accountId: event.target.value })}
          className="w-full min-w-0 sm:w-56"
        >
          <option value="all">All accounts</option>
          {selectableAccounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
      </SelectField>

      <SelectField
        label={
          <>
          <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />
          Account type
          </>
        }
          value={value.accountType}
          onChange={(event) =>
            onChange({ ...value, accountType: event.target.value, accountId: "all" })
          }
          className="w-full min-w-0 sm:w-44"
        >
          <option value="all">All types</option>
          {accountTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
      </SelectField>

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
