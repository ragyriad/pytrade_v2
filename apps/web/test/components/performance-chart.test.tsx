import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("recharts", () => ({
  CartesianGrid: () => null,
  Legend: () => null,
  Line: () => null,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { PerformanceChart } from "../../app/components/charts/performanceChart";

describe("PerformanceChart", () => {
  test("excludes deposits by default and can include them", () => {
    render(
      <PerformanceChart
        performance={{
          series: [
            {
              currency: "CAD",
              points: [
                { date: "2025-01-01", totalValue: 1_000, netExternalCashFlow: 0 },
                { date: "2026-01-01", totalValue: 1_600, netExternalCashFlow: 500 },
              ],
            },
            {
              currency: "USD",
              points: [
                { date: "2025-01-01", totalValue: 2_000, netExternalCashFlow: 0 },
                { date: "2026-01-01", totalValue: 2_700, netExternalCashFlow: 500 },
              ],
            },
          ],
        }}
      />
    );

    const depositsToggle = screen.getByRole("checkbox", { name: "Include deposits" });
    expect(depositsToggle).not.toBeChecked();
    expect(screen.getByText("CAD gain")).toBeInTheDocument();
    expect(screen.getByText("USD gain")).toBeInTheDocument();
    expect(screen.getAllByText("Gain excluding deposits")).toHaveLength(2);
    expect(screen.getByText("100.00 CAD")).toBeInTheDocument();
    expect(screen.getByText("200.00 USD")).toBeInTheDocument();
    expect(screen.queryByText("Time-weighted")).not.toBeInTheDocument();
    expect(screen.queryByText("Money-weighted (annualized)")).not.toBeInTheDocument();
    expect(screen.queryByText("SPY return")).not.toBeInTheDocument();

    fireEvent.click(depositsToggle);

    expect(depositsToggle).toBeChecked();
    expect(screen.getAllByText("Change including deposits")).toHaveLength(2);
    expect(screen.getByText("600.00 CAD")).toBeInTheDocument();
    expect(screen.getByText("700.00 USD")).toBeInTheDocument();
  });
});
