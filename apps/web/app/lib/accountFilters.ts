import { normalizeAccountType } from "./formatters";
import type { TimelineRange } from "../services/filter_timeline";

export type AccountFilterDto = Pick<import("./portfolioTypes").AccountDto,
  "id" | "name" | "institutionName" | "accountCurrency" | "type" | "subType" | "isRegistered"
>;

export type PortfolioFilterState = {
  brokerages: string[];
  accountIds: string[];
  accountTypes: string[];
  subTypes: string[];
  registered: string[];
  timeline: TimelineRange;
};

export const defaultFilterBarState: PortfolioFilterState = {
  brokerages: [],
  accountIds: [],
  accountTypes: [],
  subTypes: [],
  registered: [],
  timeline: "ALL",
};

export function getAccountBrokerage(account: AccountFilterDto | undefined): string {
  return account?.institutionName ?? "Unknown";
}

export function getAccountType(account: AccountFilterDto | undefined): string {
  return normalizeAccountType(account?.type ?? null);
}

export function getAccountSubType(account: AccountFilterDto | undefined): string {
  return normalizeAccountType(account?.subType ?? null);
}

export function getAccountRegistration(account: AccountFilterDto | undefined): string {
  return account?.isRegistered ? "Registered" : "Non-registered";
}

export function getUniqueBrokerages(accounts: AccountFilterDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountBrokerage))).sort();
}

export function getUniqueAccountTypes(accounts: AccountFilterDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountType))).sort();
}

export function getUniqueAccountSubTypes(accounts: AccountFilterDto[]): string[] {
  return Array.from(new Set(accounts.map(getAccountSubType).filter(Boolean))).sort();
}

export function getSelectableAccounts(
  accounts: AccountFilterDto[],
  filters: Pick<PortfolioFilterState, "brokerages" | "accountTypes" | "subTypes" | "registered">
): AccountFilterDto[] {
  const uniqueAccounts = new Map<string, AccountFilterDto>();

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
        filters.accountTypes.includes(getAccountType(account)) ||
        filters.accountTypes.includes(getAccountSubType(account));
      const subType = getAccountSubType(account);
      const subTypes = filters.subTypes ?? [];
      const registrations = filters.registered ?? [];
      const subTypeMatch = subTypes.length === 0 || subTypes.includes(subType);
      const registrationMatch = registrations.length === 0 || registrations.includes(getAccountRegistration(account));
      return brokerageMatch && typeMatch && subTypeMatch && registrationMatch;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function accountMatchesFilters(
  account: AccountFilterDto | undefined,
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
    filters.accountTypes.includes(getAccountType(account)) ||
    filters.accountTypes.includes(getAccountSubType(account));
  const subType = getAccountSubType(account);
  const subTypes = filters.subTypes ?? [];
  const registrations = filters.registered ?? [];
  const subTypeMatch = subTypes.length === 0 || subTypes.includes(subType);
  const registrationMatch = registrations.length === 0 || registrations.includes(getAccountRegistration(account));

  return brokerageMatch && accountMatch && typeMatch && subTypeMatch && registrationMatch;
}

export function isActiveAccount(account: AccountDto | undefined): boolean {
  if (!account?.status) return true;
  return ["active", "open"].includes(account.status.toLowerCase());
}
