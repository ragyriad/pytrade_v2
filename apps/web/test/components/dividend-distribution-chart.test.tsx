import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import type { DividendPositionYieldDto } from "../../app/lib/portfolioTypes";
import { DividendDistributionChart } from "../../app/components/charts/dividendDistributionChart";

function position(
  symbol: string,
  amount: number,
  currency: string
): DividendPositionYieldDto {
  const money = { amount: 0, currency };
  return {
    id: `${currency}-${symbol}`,
    symbol,
    description: null,
    accountId: null,
    units: 1,
    accountSegments: [],
    dividendAmount: money,
    annualizedDividendAmount: { amount, currency },
    marketValue: money,
    costBasis: money,
    costPerUnit: money,
    dividendPerShare: money,
    annualizedDividendPerShare: money,
    yieldOnCostPercent: 0,
  };
}

describe("DividendDistributionChart", () => {
  test("shows annual payout distribution by currency without portfolio navigation", () => {
    render(
      <DividendDistributionChart
        positions={[
          position("QQQI", 300, "USD"),
          position("SCHD", 100, "USD"),
          position("XIC", 200, "CAD"),
        ]}
      />
    );

    expect(screen.getByRole("heading", { name: "Annual Dividend Distribution" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("CAD dividend distribution bar")).toBeInTheDocument();
    expect(screen.getByLabelText("USD dividend distribution bar")).toBeInTheDocument();
    expect(screen.getByText("75.00%")).toBeInTheDocument();
    expect(screen.getByText("25.00%")).toBeInTheDocument();
    expect(screen.queryByText(/Portfolio\s*→/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show dividend amounts" }));

    expect(screen.getByText("300.00 USD")).toBeInTheDocument();
    expect(screen.getByText("100.00 USD")).toBeInTheDocument();
  });
});
