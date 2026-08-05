import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("recharts", () => ({
  Line: ({ name }: { name: string }) => <div data-testid="chart-line">{name}</div>,
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ReferenceLine: () => <div data-testid="zero-line" />,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null,
}));

import { PerformanceChart } from "../../app/components/charts/performanceChart";

const performance = {
  series: [
    {
      accountId: "cad-account",
      currency: "CAD",
      points: [
        { date: "2025-01-01", totalValue: 1_000, netExternalCashFlow: 0 },
        { date: "2026-01-01", totalValue: 1_600, netExternalCashFlow: 500 },
      ],
    },
    {
      accountId: "usd-account",
      currency: "USD",
      points: [
        { date: "2025-01-01", totalValue: 2_000, netExternalCashFlow: 0 },
        { date: "2026-01-01", totalValue: 2_700, netExternalCashFlow: 500 },
      ],
    },
  ],
};

describe("PerformanceChart", () => {
  test("renders CAD and USD together and changes headline values with chart mode", () => {
    render(
      <PerformanceChart
        performance={performance}
        accountIds={["cad-account", "usd-account"]}
        timeline="ALL"
      />
    );

    expect(screen.getAllByTestId("chart-line").map((line) => line.textContent)).toEqual([
      "CAD return",
      "USD return",
    ]);
    expect(screen.getByText("+100.00 CAD")).toBeInTheDocument();
    expect(screen.getByText("+200.00 USD")).toBeInTheDocument();
    expect(screen.getAllByText("+10.00% all time")).toHaveLength(2);
    expect(screen.getByTestId("zero-line")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Value" }));

    expect(screen.getAllByTestId("chart-line").map((line) => line.textContent)).toEqual([
      "CAD value",
      "USD value",
    ]);
    expect(screen.getByText("1,600.00 CAD")).toBeInTheDocument();
    expect(screen.getByText("2,700.00 USD")).toBeInTheDocument();
    expect(screen.queryByTestId("zero-line")).not.toBeInTheDocument();
  });

  test("includes deposits only on request", () => {
    render(
      <PerformanceChart
        performance={performance}
        accountIds={["cad-account", "usd-account"]}
        timeline="ALL"
      />
    );

    const depositsToggle = screen.getByRole("checkbox", { name: "Include deposits" });
    expect(depositsToggle).not.toBeChecked();
    fireEvent.click(depositsToggle);
    expect(screen.getByText("+600.00 CAD")).toBeInTheDocument();
    expect(screen.getByText("+700.00 USD")).toBeInTheDocument();
  });

  test("stops at complete data and responds to account and timeline filters", () => {
    const incompletePerformance = {
      series: [
        {
          accountId: "cad-a",
          currency: "CAD",
          points: [
            { date: "2026-06-01", totalValue: 100, netExternalCashFlow: 0 },
            { date: "2026-08-01", totalValue: 120, netExternalCashFlow: 0 },
            { date: "2026-08-03", totalValue: 130, netExternalCashFlow: 0 },
          ],
        },
        {
          accountId: "cad-b",
          currency: "CAD",
          points: [
            { date: "2026-06-01", totalValue: 200, netExternalCashFlow: 0 },
            { date: "2026-08-01", totalValue: 220, netExternalCashFlow: 0 },
          ],
        },
      ],
    };
    const { rerender } = render(
      <PerformanceChart
        performance={incompletePerformance}
        accountIds={["cad-a", "cad-b"]}
        timeline="3M"
      />
    );

    expect(screen.getByText("+40.00 CAD")).toBeInTheDocument();
    expect(screen.getByText(/CAD data through Aug 1, 2026/)).toBeInTheDocument();
    expect(screen.getByText("+13.33% past 3 months")).toBeInTheDocument();

    rerender(
      <PerformanceChart
        performance={incompletePerformance}
        accountIds={["cad-a"]}
        timeline="3M"
      />
    );

    expect(screen.getByText("+30.00 CAD")).toBeInTheDocument();
    expect(screen.getByText(/CAD data through Aug 3, 2026/)).toBeInTheDocument();
  });
});
