export const queryKeys = {
  adminUsers: ["admin", "users"] as const,
  dividendSummary: (timeline: string, accountIds: string[]) =>
    ["dividends", "summary", { timeline, accountIds }] as const,
  securityTransactions: (securityId: string) =>
    ["securities", securityId, "transactions"] as const,
};
