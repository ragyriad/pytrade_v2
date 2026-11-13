import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { ReactNode } from "react";
import type { HistoricSecurityDto } from "../../app/lib/portfolioTypes";

vi.mock("../../app/components/dashboard/dataTable", () => ({
  DataTable: ({ rows, searchAccessory }: {
    rows: Array<{ symbol: string; accounts?: Array<{ name: string }> }>;
    searchAccessory?: ReactNode;
  }) => (
    <>
      <div data-testid="table-header">
        <input aria-label="Search rows" />
        {searchAccessory}
      </div>
      <div data-testid="security-rows">
        {rows.map((row) => `${row.symbol} [${row.accounts?.map((account) => account.name).join("/") ?? ""}]`).join(",")}
      </div>
    </>
  ),
}));

import { SecuritiesPage } from "../../app/pages/securitiesPage";

const registeredAccount = {
  id: "tfsa",
  name: "Demo TFSA",
  institutionName: "Broker A",
  accountCurrency: "CAD",
  type: "Investment",
  subType: "TFSA",
  isRegistered: true,
};
const nonRegisteredAccount = {
  id: "margin",
  name: "Demo Margin",
  institutionName: "Broker B",
  accountCurrency: "USD",
  type: "Investment",
  subType: "MARGIN",
  isRegistered: false,
};

function security(
  id: string,
  symbol: string,
  accounts: HistoricSecurityDto["accounts"],
  status: HistoricSecurityDto["status"] = "active"
): HistoricSecurityDto {
  return {
    id,
    securityKey: symbol,
    snaptradeSymbolId: null,
    symbol,
    rawSymbol: symbol,
    description: symbol,
    currencyCode: "CAD",
    exchangeCode: "TSX",
    exchangeMicCode: null,
    exchangeName: null,
    instrumentType: "Equity",
    listingStatus: "ACTIVE",
    delistedAt: null,
    figiCode: null,
    logoUrl: null,
    transactionCount: 1,
    buyCount: 1,
    sellCount: 0,
    dividendCount: 0,
    totalGainLoss: { amount: 0, currency: "CAD" },
    totalGainLossPercent: null,
    totalBuyCost: { amount: 100, currency: "CAD" },
    firstTradeDate: "2026-01-01",
    lastTradeDate: "2026-01-01",
    status,
    accounts,
  };
}

const securities = [
  security("security-a", "AAPL", [registeredAccount, nonRegisteredAccount]),
  security("security-a-duplicate", "AAPL", [registeredAccount]),
  security("security-b", "SHOP", [nonRegisteredAccount]),
  security("security-closed", "BMO", [nonRegisteredAccount], "closed"),
];

describe("SecuritiesPage account filters", () => {
  test("uses linked account metadata and keeps a security when any account matches", () => {
    render(<SecuritiesPage securities={securities} />);

    expect(screen.getByTestId("security-rows")).toHaveTextContent(
      "AAPL [Demo TFSA/Demo Margin],SHOP [Demo Margin]"
    );
    expect(screen.getByTestId("security-rows")).not.toHaveTextContent("BMO");
    expect(within(screen.getByTestId("table-header")).getByRole("checkbox", { name: "Show Closed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Closed" }));
    expect(screen.getByTestId("security-rows")).toHaveTextContent("BMO [Demo Margin]");
    fireEvent.click(screen.getByRole("checkbox", { name: "Show Closed" }));
    fireEvent.click(screen.getByText("All registration types"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Registered" }));

    expect(screen.getByTestId("security-rows")).toHaveTextContent("AAPL [Demo TFSA]");
    expect(screen.getByTestId("security-rows")).not.toHaveTextContent("SHOP");
  });
});
