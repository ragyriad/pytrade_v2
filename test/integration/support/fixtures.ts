import {
  accounts,
  db,
  positions,
  securities,
  transactions,
  users,
} from "@repo/db";

export const USER_A_ID = "10000000-0000-4000-8000-000000000001";
export const USER_B_ID = "20000000-0000-4000-8000-000000000002";
export const ACCOUNT_A_ID = "30000000-0000-4000-8000-000000000003";
export const ACCOUNT_B_ID = "40000000-0000-4000-8000-000000000004";
export const ACCOUNT_C_ID = "60000000-0000-4000-8000-000000000006";
export const SECURITY_A_ID = "50000000-0000-4000-8000-000000000005";

export async function seedTwoUserPortfolio(): Promise<void> {
  await db.insert(users).values([
    {
      id: USER_A_ID,
      username: "integration_a",
      clerkUserId: "user_integration_a",
      email: "integration-a@example.test",
      role: "admin",
      status: "active",
    },
    {
      id: USER_B_ID,
      username: "integration_b",
      clerkUserId: "user_integration_b",
      email: "integration-b@example.test",
      role: "user",
      status: "active",
    },
  ]);

  await db.insert(accounts).values([
    {
      id: ACCOUNT_A_ID,
      userId: USER_A_ID,
      brokerageAccountNumber: "INTEGRATION-A",
      brokerageName: "Test Brokerage",
      name: "User A account",
      type: "Investment",
      subType: "TFSA",
      accountCurrency: "CAD",
      balanceAmount: "1000.00",
      balanceCurrency: "CAD",
    },
    {
      id: ACCOUNT_B_ID,
      userId: USER_B_ID,
      brokerageAccountNumber: "INTEGRATION-B",
      brokerageName: "Test Brokerage",
      name: "User B account",
      type: "Investment",
      subType: "RRSP",
      accountCurrency: "USD",
      balanceAmount: "9000.00",
      balanceCurrency: "USD",
    },
    {
      id: ACCOUNT_C_ID,
      userId: USER_A_ID,
      brokerageAccountNumber: "INTEGRATION-A-CASH",
      brokerageName: "Test Bank",
      name: "User A cash account",
      type: "Cash",
      subType: "CASH",
      accountCurrency: "CAD",
      balanceAmount: "250.00",
      balanceCurrency: "CAD",
    },
  ]);

  await db.insert(securities).values({
    id: SECURITY_A_ID,
    securityKey: "integration:TST",
    symbol: "TST",
    rawSymbol: "TST",
    description: "Integration Test Security",
    currencyCode: "CAD",
    instrumentTypeDescription: "Common Stock",
  });

  await db.insert(positions).values([
    {
      accountId: ACCOUNT_A_ID,
      securityId: SECURITY_A_ID,
      symbol: "TST",
      units: "10",
      price: "20",
      averagePurchasePrice: "15",
      currencyCode: "CAD",
      instrumentTypeDescription: "Equity",
    },
    {
      accountId: ACCOUNT_B_ID,
      symbol: "PRIVATE-B",
      units: "99",
      price: "100",
      averagePurchasePrice: "90",
      currencyCode: "USD",
      instrumentTypeDescription: "Equity",
    },
  ]);

  await db.insert(transactions).values([
    {
      snaptradeTransactionId: "integration-transaction-a",
      accountId: ACCOUNT_A_ID,
      securityId: SECURITY_A_ID,
      type: "BUY",
      action: "BUY",
      assetType: "Equity",
      amount: "150.00",
      price: "15.00",
      units: "10",
      currencyCode: "CAD",
      symbol: "TST",
      tradeDate: new Date("2026-01-02T12:00:00.000Z"),
    },
    {
      snaptradeTransactionId: "integration-transaction-b",
      accountId: ACCOUNT_B_ID,
      type: "BUY",
      action: "BUY",
      assetType: "Equity",
      amount: "8900.00",
      price: "89.00",
      units: "100",
      currencyCode: "USD",
      symbol: "PRIVATE-B",
      tradeDate: new Date("2026-01-03T12:00:00.000Z"),
    },
    {
      snaptradeTransactionId: "integration-transaction-c",
      accountId: ACCOUNT_C_ID,
      type: "DEPOSIT",
      action: "DEPOSIT",
      assetType: "Cash",
      amount: "250.00",
      currencyCode: "CAD",
      tradeDate: new Date("2026-01-04T12:00:00.000Z"),
    },
  ]);
}
