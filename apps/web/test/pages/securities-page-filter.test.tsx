import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { HistoricSecurityDto } from "../../app/lib/portfolioTypes";

vi.mock("../../app/components/dashboard/dataTable", () => ({
  DataTable: ({ rows }: { rows: Array<{ symbol: string }> }) => (
    <div data-testid="security-rows">{rows.map((row) => row.symbol).join(",")}</div>
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
  accounts: HistoricSecurityDto["accounts"]
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
    firstTradeDate: "2026-01-01",
    lastTradeDate: "2026-01-01",
    status: "closed",
    accounts,
  };
}

const securities = [
  security("security-a", "AAPL", [registeredAccount, nonRegisteredAccount]),
  security("security-b", "SHOP", [nonRegisteredAccount]),
];

describe("SecuritiesPage account filters", () => {
  test("uses linked account metadata and keeps a security when any account matches", () => {
    render(<SecuritiesPage securities={securities} />);

    expect(screen.getByTestId("security-rows")).toHaveTextContent("AAPL,SHOP");
    fireEvent.click(screen.getByText("All registration types"));
    fireEvent.click(screen.getByRole("checkbox", { name: "Registered" }));

    expect(screen.getByTestId("security-rows")).toHaveTextContent("AAPL");
    expect(screen.getByTestId("security-rows")).not.toHaveTextContent("SHOP");
  });
});
