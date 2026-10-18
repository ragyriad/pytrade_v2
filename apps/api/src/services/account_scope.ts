type AccountScopeInput = {
  type: string | null;
  status?: string | null;
  isArchived: boolean;
};

export function isInvestmentAccount(account: AccountScopeInput): boolean {
  return !account.isArchived && account.type === "Investment";
}

export function isCashPageAccount(account: AccountScopeInput): boolean {
  return !account.isArchived && (account.type === "Cash" || account.type === "Card");
}
