import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { PortfolioFilterState } from "../../app/lib/accountFilters";
import type { PortfolioDashboardDto } from "../../app/lib/portfolioTypes";

vi.mock("../../app/components/charts/performanceChart", () => ({
  PerformanceChart: ({
    accountIds,
    timeline,
  }: {
    accountIds: string[];
    timeline: string;
  }) => <div data-testid="performance-scope">{accountIds.join(",")}:{timeline}</div>,
}));

vi.mock("../../app/components/dashboard/filterBar", () => ({
  FilterBar: ({
    onChange,
  }: {
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
        timeline: "3M",
      })}
    >
      Apply portfolio filters
    </button>
  ),
}));

vi.mock("../../app/components/charts/allocationPieChart", () => ({
  AllocationPieChart: () => <div data-testid="portfolio-allocation" />,
}));
vi.mock("../../app/components/dashboard/dataTable", () => ({
  DataTable: () => null,
}));
vi.mock("../../app/components/dashboard/statCard", () => ({
  StatCard: ({ label, value }: { label: string; value: string }) => (
    <div>{label}: {value}</div>
  ),
}));

import { HomePage } from "../../app/pages/homePage";

const dashboard: PortfolioDashboardDto = {
  summary: {
    user: { id: "user", username: "user" },
    totalValue: { amount: 1_000, currency: "CAD" },
    totalValueByCurrency: [],
    totalUnrealizedGainLoss: { amount: 250, currency: "CAD" },
    totalUnrealizedGainLossByCurrency: [],
    accountCount: 2,
    positionCount: 0,
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
      balance: { amount: 100, currency: "CAD" },
      lastSyncedAt: null,
    },
    {
      id: "expense-account",
      name: "Expense Account",
      institutionName: "Broker C",
      type: "Expenses",
      subType: "CASH",
      isRegistered: false,
      status: "active",
      isInvestmentAccount: false,
      balance: { amount: 100, currency: "CAD" },
      lastSyncedAt: null,
    },
  ],
  positions: [],
  transactions: [],
  recentTransactions: [],
  allocationByAssetType: [],
  allocationByAccount: [],
  dividends: { totalByCurrency: [], byAccount: [], byBrokerage: [], transactions: [] },
  fees: { totalByCurrency: [], transactions: [] },
  performance: null,
};

describe("HomePage performance filters", () => {
  test("passes selected accounts and timeline to the performance chart", () => {
    render(<HomePage dashboard={dashboard} />);

    expect(screen.getByTestId("performance-scope")).toHaveTextContent(
      "account-a,account-b:ALL"
    );
    expect(screen.getByText(/Filtered market value:/)).toHaveTextContent("0.00 CAD");
    expect(screen.getByText(/Unrealized gain\/loss:/)).toHaveTextContent("0.00 CAD");

    fireEvent.click(screen.getByRole("button", { name: "Apply portfolio filters" }));

    expect(screen.getByTestId("performance-scope")).toHaveTextContent("account-a:3M");
    expect(screen.queryByTestId("portfolio-allocation")).not.toBeInTheDocument();
  });
});
