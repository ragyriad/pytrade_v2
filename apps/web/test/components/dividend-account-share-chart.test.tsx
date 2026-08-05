import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, test, vi } from "vitest";

vi.mock("recharts", () => ({
  Cell: () => null,
  Pie: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Tooltip: () => null,
}));

import { DividendAccountShareChart } from "../../app/components/charts/dividendAccountShareChart";

describe("DividendAccountShareChart", () => {
  test("explains account percentages and labels each currency chart", () => {
    render(
      <DividendAccountShareChart
        groups={[
          {
            currency: "CAD",
            total: 100,
            rows: [{
              id: "cad-account",
              label: "CAD Account",
              value: 100,
              percentage: 100,
              currency: "CAD",
            }],
          },
          {
            currency: "USD",
            total: 50,
            rows: [{
              id: "usd-account",
              label: "USD Account",
              value: 50,
              percentage: 100,
              currency: "USD",
            }],
          },
        ]}
      />
    );

    expect(screen.getByRole("heading", {
      name: "Dividend by Account Percentage and Currency",
    }))
      .toBeInTheDocument();
    expect(screen.getByText(
      "Each slice is an account's percentage of dividends in that currency."
    )).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CAD dividends" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "USD dividends" })).toBeInTheDocument();
  });
});
