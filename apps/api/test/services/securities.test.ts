import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHistoricSecuritiesByAccounts: vi.fn(),
  getHistoricSecurityAccountIds: vi.fn(),
  getSecurityById: vi.fn(),
  getTransactionsBySecurity: vi.fn(),
  and: vi.fn(() => null),
  desc: vi.fn(() => null),
  eq: vi.fn(() => null),
  accounts: {},
  db: {},
}));

vi.mock("@repo/db", () => mocks);

import { getHistoricSecurities } from "../../src/services/securities.js";

const accountRows = [
  {
    id: "account-open",
    isArchived: false,
    type: "Investment",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    name: "Open TFSA",
    brokerageAccountNumber: "OPEN-1",
    brokerageName: "Broker A",
    accountCurrency: "CAD",
    subType: "TFSA",
    isRegistered: true,
  },
  {
    id: "account-closed",
    isArchived: false,
    type: "Investment",
    status: "closed",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    name: "Closed Margin",
    brokerageAccountNumber: "CLOSED-1",
    brokerageName: "Broker B",
    accountCurrency: "USD",
    subType: "MARGIN",
    isRegistered: false,
  },
];

const securityRow = {
  id: "security-1",
  securityKey: "TEST:ABC",
  snaptradeSymbolId: null,
  symbol: "ABC",
  rawSymbol: "ABC",
  description: "Example Corp",
  currencyCode: "CAD",
  exchangeCode: "TSX",
  exchangeMicCode: null,
  exchangeName: "Toronto Stock Exchange",
  instrumentTypeDescription: "Equity",
  instrumentTypeCode: "eq",
  listingStatus: "ACTIVE",
  delistedAt: null,
  figiCode: null,
  logoUrl: null,
  transactionCount: 2,
  buyCount: 1,
  sellCount: 1,
  dividendCount: 0,
  totalGainLossAmount: 10,
  totalBuyCostAmount: 100,
  totalGainLossCurrency: "CAD",
  firstTradeDate: new Date("2025-01-01T00:00:00.000Z"),
  lastTradeDate: new Date("2026-01-01T00:00:00.000Z"),
  isCurrentlyHeld: false,
};

function fakeDatabase() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: async () => accountRows,
        }),
      }),
    }),
  };
}

describe("historic security account associations", () => {
  beforeEach(() => vi.clearAllMocks());

  test("returns linked account filter metadata for open and closed investment accounts", async () => {
    mocks.getHistoricSecuritiesByAccounts.mockResolvedValue([securityRow]);
    mocks.getHistoricSecurityAccountIds.mockResolvedValue([
      { securityId: "security-1", accountId: "account-open" },
      { securityId: "security-1", accountId: "account-closed" },
    ]);

    const result = await getHistoricSecurities("user-1", fakeDatabase() as never);

    expect(result?.[0]?.accounts).toEqual([
      {
        id: "account-open",
        name: "Open TFSA",
        institutionName: "Broker A",
        accountCurrency: "CAD",
        type: "Investment",
        subType: "TFSA",
        isRegistered: true,
      },
      {
        id: "account-closed",
        name: "Closed Margin",
        institutionName: "Broker B",
        accountCurrency: "USD",
        type: "Investment",
        subType: "MARGIN",
        isRegistered: false,
      },
    ]);
    expect(mocks.getHistoricSecuritiesByAccounts).toHaveBeenCalledWith(
      expect.anything(),
      ["account-open", "account-closed"]
    );
  });
});
