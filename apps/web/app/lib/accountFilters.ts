import { normalizeAccountType } from "./formatters";
import type { AccountDto } from "./portfolioTypes";
import type { TimelineRange } from "../services/filter_timeline";

export type PortfolioFilterState = {
  brokerages: string[];
  accountIds: string[];
  accountTypes: string[];
  timeline: TimelineRange;
};

export const defaultFilterBarState: PortfolioFilterState = {
  brokerages: [],
  accountIds: [],
  accountTypes: [],
  timeline: "ALL",
};

export function getAccountBrokerage(account: AccountDto | undefined): string {
  return account?.institutionName ?? "Unknown";
}

export function getAccountType(account: AccountDto | undefined): string {
  return normalizeAccountType(account?.subType ?? account?.type ?? null);
}

export function getUniqueBrokerages(accounts: AccountDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountBrokerage))).sort();
}

export function getUniqueAccountTypes(accounts: AccountDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountType))).sort();
}

export function getSelectableAccounts(
  accounts: AccountDto[],
  filters: Pick<PortfolioFilterState, "brokerages" | "accountTypes">
): AccountDto[] {
  const uniqueAccounts = new Map<string, AccountDto>();

  for (const account of accounts) {
    // Dashboard data may contain the same account more than once. Keep one option
    // per account ID so the filter never renders duplicate choices.
    uniqueAccounts.set(account.id, account);
  }

  return Array.from(uniqueAccounts.values())
    .filter((account) => {
      const brokerageMatch =
        filters.brokerages.length === 0 ||
        filters.brokerages.includes(getAccountBrokerage(account));
      const typeMatch =
        filters.accountTypes.length === 0 ||
        filters.accountTypes.includes(getAccountType(account));
      return brokerageMatch && typeMatch;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function accountMatchesFilters(
  account: AccountDto | undefined,
  filters: PortfolioFilterState
): boolean {
  if (!account) return false;

  const brokerageMatch =
    filters.brokerages.length === 0 ||
    filters.brokerages.includes(getAccountBrokerage(account));
  const accountMatch =
    filters.accountIds.length === 0 || filters.accountIds.includes(account.id);
  const typeMatch =
    filters.accountTypes.length === 0 ||
    filters.accountTypes.includes(getAccountType(account));

  return brokerageMatch && accountMatch && typeMatch;
}

export function isActiveAccount(account: AccountDto | undefined): boolean {
  if (!account?.status) return true;
  return ["active", "open"].includes(account.status.toLowerCase());
}
