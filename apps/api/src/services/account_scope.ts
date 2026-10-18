type AccountScopeInput = {
  type: string | null;
  status?: string | null;
  isArchived: boolean;
};

export function isInvestmentAccount(account: AccountScopeInput): boolean {
  return !account.isArchived && account.type === "Investment";
}

export function isOpenAccount(account: AccountScopeInput): boolean {
  if (!account.status) return true;
  return ["active", "open"].includes(account.status.toLowerCase());
}

export function isCashPageAccount(account: AccountScopeInput): boolean {
  return !account.isArchived && (account.type === "Cash" || account.type === "Card");
}
