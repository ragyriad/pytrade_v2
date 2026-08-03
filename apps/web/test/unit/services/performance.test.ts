import { describe, expect, test } from "vitest";
import {
  annualizedGainPercent,
  buildPortfolioGainPoints,
} from "../../../app/services/performance";

describe("buildPortfolioGainPoints", () => {
  const points = [
    { date: "2026-01-01", totalValue: 1_000, netExternalCashFlow: 0 },
    { date: "2026-02-01", totalValue: 1_600, netExternalCashFlow: 500 },
    { date: "2026-03-01", totalValue: 1_700, netExternalCashFlow: 500 },
  ];

  test("shows gains after removing net deposits by default", () => {
    expect(buildPortfolioGainPoints(points, false).map((point) => point.portfolioGain)).toEqual([
      0,
      100,
      200,
    ]);
  });

  test("includes deposits when requested", () => {
    expect(buildPortfolioGainPoints(points, true).map((point) => point.portfolioGain)).toEqual([
      0,
      600,
      700,
    ]);
  });

  test("annualizes the displayed gain or loss percentage", () => {
    const annualPoints = [
      { date: "2025-01-01", totalValue: 1_000, netExternalCashFlow: 0 },
      { date: "2026-01-01", totalValue: 1_100, netExternalCashFlow: 0 },
    ];

    expect(annualizedGainPercent(annualPoints, false)).toBeCloseTo(10, 1);
  });
});
