import { normalizeAccountType } from "./formatters";
import type { AccountDto } from "./portfolio-types";
import type { TimelineRange } from "../business/timeline";

export type PortfolioFilterState = {
  brokerage: string;
  accountId: string;
  accountType: string;
  timeline: TimelineRange;
};

export const defaultPortfolioFilters: PortfolioFilterState = {
  brokerage: "all",
  accountId: "all",
  accountType: "all",
  timeline: "ALL",
};

export function getAccountBrokerage(account: AccountDto | undefined): string {
  return account?.institutionName ?? "Unknown";
}

export function getAccountType(account: AccountDto | undefined): string {
  return normalizeAccountType(account?.type ?? null);
}

export function getUniqueBrokerages(accounts: AccountDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountBrokerage))).sort();
}

export function getUniqueAccountTypes(accounts: AccountDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountType))).sort();
}

export function getSelectableAccounts(
  accounts: AccountDto[],
  filters: Pick<PortfolioFilterState, "brokerage" | "accountType">
): AccountDto[] {
  return accounts
    .filter((account) => {
      const brokerageMatch =
        filters.brokerage === "all" || getAccountBrokerage(account) === filters.brokerage;
      const typeMatch =
        filters.accountType === "all" || getAccountType(account) === filters.accountType;
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
    filters.brokerage === "all" || getAccountBrokerage(account) === filters.brokerage;
  const accountMatch = filters.accountId === "all" || account.id === filters.accountId;
  const typeMatch =
    filters.accountType === "all" || getAccountType(account) === filters.accountType;

  return brokerageMatch && accountMatch && typeMatch;
}

export function isActiveAccount(account: AccountDto | undefined): boolean {
  if (!account?.status) return true;
  return ["active", "open"].includes(account.status.toLowerCase());
}
