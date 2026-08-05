import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("recharts", () => ({
  Area: () => null,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { TotalDividendsChart } from "../../app/components/charts/totalDividendChart";

describe("TotalDividendsChart", () => {
  test("shows total dividend amounts for each currency", () => {
    render(
      <TotalDividendsChart
        transactions={[]}
        totals={[
          { amount: 1_250.5, currency: "CAD" },
          { amount: 875.25, currency: "USD" },
        ]}
      />
    );

    expect(screen.getByLabelText("Total dividends by currency")).toBeInTheDocument();
    expect(screen.getByText("1,250.50 CAD")).toBeInTheDocument();
    expect(screen.getByText("875.25 USD")).toBeInTheDocument();
  });
});
