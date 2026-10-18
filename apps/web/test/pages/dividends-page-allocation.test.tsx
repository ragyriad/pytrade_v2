import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { PortfolioFilterState } from "../../app/lib/accountFilters";
import type {
  DividendDashboardSummaryDto,
  PortfolioDashboardDto,
} from "../../app/lib/portfolioTypes";

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ initialData, placeholderData }: {
    initialData?: DividendDashboardSummaryDto;
    placeholderData?: (
      previous: DividendDashboardSummaryDto | undefined
    ) => DividendDashboardSummaryDto;
  }) => ({
    data: initialData ?? placeholderData?.(undefined),
    error: null,
    isFetching: false,
  }),
}));

vi.mock("../../app/components/dashboard/filterBar", () => ({
  FilterBar: ({ onChange }: {
    onChange: (filters: PortfolioFilterState) => void;
  }) => (
    <button
      type="button"
      onClick={() => onChange({
        brokerages: ["Broker A"],
        accountIds: [],
        accountTypes: [],
        subTypes: [],
        registered: [],
        timeline: "ALL",
      })}
    >
      Select Broker A
    </button>
  ),
}));

vi.mock("../../app/components/charts/totalDividendChart", () => ({
  TotalDividendsChart: () => <div data-testid="total-dividends-chart" />,
}));
vi.mock("../../app/components/charts/allocationPieChart", () => ({
  AllocationPieChart: ({ rows }: { rows: Array<{ label: string }> }) => (
    <div data-testid="allocation-chart">
      {rows.map((row) => row.label).join(",")}
    </div>
  ),
}));
vi.mock("../../app/components/charts/dividendDistributionChart", () => ({
  DividendDistributionChart: () => null,
}));
vi.mock("../../app/components/charts/dividendMonthlyGrowthChart", () => ({
  DividendMonthlyGrowthChart: () => null,
}));
vi.mock("../../app/components/charts/dividendCurrentYearChart", () => ({
  DividendCurrentYearChart: () => null,
}));
vi.mock("../../app/components/charts/dividendAccountShareChart", () => ({
  DividendAccountShareChart: () => null,
}));
vi.mock("../../app/components/charts/dividendPositionYieldChart", () => ({
  DividendPositionYieldChart: () => null,
}));
vi.mock("../../app/components/dashboard/dataTable", () => ({
  DataTable: () => null,
}));
vi.mock("../../app/components/dashboard/segmentedTabs", () => ({
  SegmentedTabs: () => null,
}));
vi.mock("../../app/components/dashboard/statCard", () => ({
  StatCard: () => null,
}));
vi.mock("../../app/components/dashboard/metricValueList", () => ({
  MetricValueList: () => null,
}));
vi.mock("../../app/components/portfolio/dividendEventsCalendar", () => ({
  DividendEventsCalendar: () => null,
}));

import { DividendsPage } from "../../app/pages/dividendsPage";

const dashboard: PortfolioDashboardDto = {
  summary: {
    user: { id: "user", username: "user" },
    totalValue: { amount: 300, currency: "CAD" },
    totalValueByCurrency: [{ amount: 300, currency: "CAD" }],
    totalUnrealizedGainLoss: { amount: 0, currency: "CAD" },
    totalUnrealizedGainLossByCurrency: [],
    accountCount: 2,
    positionCount: 2,
    transactionCount: 0,
    lastSyncedAt: null,
  },
  accounts: [
    {
      id: "account-a",
      name: "Account A",
      institutionName: "Broker A",
      type: "Investment",
      management: "Self_Managed",
      subType: "TFSA",
      isRegistered: true,
      status: "active",
      isInvestmentAccount: true,
      balance: { amount: 100, currency: "CAD" },
      lastSyncedAt: null,
    },
    {
      id: "account-b",
      name: "Account B",
      institutionName: "Broker B",
      type: "Investment",
      management: "Managed",
      subType: "RRSP",
      isRegistered: true,
      status: "active",
      isInvestmentAccount: true,
      balance: { amount: 200, currency: "CAD" },
      lastSyncedAt: null,
    },
  ],
  positions: [
    {
      id: "position-a",
      accountId: "account-a",
      securityId: "security-a",
      symbol: "AAPL",
      description: "Apple",
      units: 1,
      price: { amount: 100, currency: "CAD" },
      marketValue: { amount: 100, currency: "CAD" },
      averagePurchasePrice: { amount: 100, currency: "CAD" },
      unrealizedGainLoss: { amount: 0, currency: "CAD" },
      assetType: "equity",
      isCashEquivalent: false,
    },
    {
      id: "position-b",
      accountId: "account-b",
      securityId: "security-b",
      symbol: "SHOP",
      description: "Shopify",
      units: 1,
      price: { amount: 200, currency: "CAD" },
      marketValue: { amount: 200, currency: "CAD" },
      averagePurchasePrice: { amount: 200, currency: "CAD" },
      unrealizedGainLoss: { amount: 0, currency: "CAD" },
      assetType: "equity",
      isCashEquivalent: false,
    },
  ],
  transactions: [],
  recentTransactions: [],
  allocationByAssetType: [],
  allocationByAccount: [],
  dividends: { totalByCurrency: [], byAccount: [], byBrokerage: [], transactions: [] },
  fees: { totalByCurrency: [], transactions: [] },
  performance: null,
};

const summary: DividendDashboardSummaryDto = {
  timeline: "ALL",
  metrics: {
    totalDividends: [],
    annualIncome: [],
    monthlyIncome: [],
    currentYieldByCurrency: [],
    yieldOnCostByCurrency: [],
  },
  accountShareGroups: [],
  positionYields: [],
  positionRows: [],
  transactions: [],
  calendarEvents: [],
};

describe("DividendsPage allocation", () => {
  test("places allocation after total dividends and scopes it to selected accounts", () => {
    render(<DividendsPage dashboard={dashboard} initialSummary={summary} />);

    const totals = screen.getByTestId("total-dividends-chart");
    const allocation = screen.getByTestId("allocation-chart");
    expect(allocation).toHaveTextContent("SHOP,AAPL");
    expect(
      totals.compareDocumentPosition(allocation) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Select Broker A" }));

    expect(screen.getByTestId("allocation-chart")).toHaveTextContent("AAPL");
    expect(screen.getByTestId("allocation-chart")).not.toHaveTextContent("SHOP");
  });
});
