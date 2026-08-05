import { describe, expect, test } from "vitest";
import {
  buildCompleteCurrencySeries,
  buildPortfolioGainPoints,
  filterPerformancePoints,
  gainPercent,
} from "../../../app/services/performance";

describe("buildCompleteCurrencySeries", () => {
  test("stops at the latest date where every selected account has a value", () => {
    const result = buildCompleteCurrencySeries([
      {
        accountId: "cad-a",
        currency: "CAD",
        points: [
          { date: "2026-08-01", totalValue: 100, netExternalCashFlow: 0 },
          { date: "2026-08-02", totalValue: 110, netExternalCashFlow: 0 },
          { date: "2026-08-03", totalValue: 120, netExternalCashFlow: 0 },
        ],
      },
      {
        accountId: "cad-b",
        currency: "CAD",
        points: [
          { date: "2026-08-01", totalValue: 200, netExternalCashFlow: 0 },
          { date: "2026-08-02", totalValue: 210, netExternalCashFlow: 0 },
        ],
      },
    ], ["cad-a", "cad-b"]);

    expect(result[0].dataThroughDate).toBe("2026-08-02");
    expect(result[0].excludedAccountCount).toBe(0);
    expect(result[0].points).toEqual([
      { date: "2026-08-01", totalValue: 300, netExternalCashFlow: 0 },
      { date: "2026-08-02", totalValue: 320, netExternalCashFlow: 0 },
    ]);
  });

  test("aggregates only selected accounts and keeps currencies separate", () => {
    const result = buildCompleteCurrencySeries([
      {
        accountId: "cad-a",
        currency: "CAD",
        points: [
          { date: "2026-08-01", totalValue: 100, netExternalCashFlow: 0 },
          { date: "2026-08-02", totalValue: 110, netExternalCashFlow: 0 },
        ],
      },
      {
        accountId: "cad-b",
        currency: "CAD",
        points: [
          { date: "2026-08-01", totalValue: 900, netExternalCashFlow: 0 },
          { date: "2026-08-02", totalValue: 950, netExternalCashFlow: 0 },
        ],
      },
      {
        accountId: "usd-a",
        currency: "USD",
        points: [
          { date: "2026-08-01", totalValue: 200, netExternalCashFlow: 0 },
          { date: "2026-08-02", totalValue: 220, netExternalCashFlow: 0 },
        ],
      },
    ], ["cad-a", "usd-a"]);

    expect(result.map((series) => series.currency)).toEqual(["CAD", "USD"]);
    expect(result[0].points.at(-1)?.totalValue).toBe(110);
    expect(result[1].points.at(-1)?.totalValue).toBe(220);
  });

  test("omits selected accounts that have no usable history without hiding valid accounts", () => {
    const result = buildCompleteCurrencySeries([
      {
        accountId: "cad-valid",
        currency: "CAD",
        points: [
          { date: "2026-08-01", totalValue: 100, netExternalCashFlow: 0 },
          { date: "2026-08-02", totalValue: 110, netExternalCashFlow: 0 },
        ],
      },
      { accountId: "cad-empty", currency: "CAD", points: [] },
    ], ["cad-valid", "cad-empty"]);

    expect(result[0].points.at(-1)?.totalValue).toBe(110);
    expect(result[0].excludedAccountCount).toBe(1);
  });
});

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

  test("rebases cumulative cash flow for a selected period", () => {
    const selectedPeriod = points.slice(1);

    expect(
      buildPortfolioGainPoints(selectedPeriod, false).map((point) => point.portfolioGain)
    ).toEqual([0, 100]);
  });

  test("calculates the displayed, non-annualized gain percentage", () => {
    expect(gainPercent(points, false)).toBeCloseTo(20, 5);
    expect(gainPercent(points, true)).toBeCloseTo(70, 5);
  });
});

describe("filterPerformancePoints", () => {
  const points = [
    { date: "2025-01-01", totalValue: 800, netExternalCashFlow: 0 },
    { date: "2026-01-01", totalValue: 900, netExternalCashFlow: 0 },
    { date: "2026-07-01", totalValue: 950, netExternalCashFlow: 0 },
    { date: "2026-07-27", totalValue: 980, netExternalCashFlow: 0 },
    { date: "2026-08-03", totalValue: 1_000, netExternalCashFlow: 0 },
  ];

  test("selects the closest baseline for a time range", () => {
    expect(filterPerformancePoints(points, "1W").map((point) => point.date)).toEqual([
      "2026-07-27",
      "2026-08-03",
    ]);
    expect(filterPerformancePoints(points, "1M")[0].date).toBe("2026-07-01");
  });

  test("supports year-to-date and all-time ranges", () => {
    expect(filterPerformancePoints(points, "YTD")[0].date).toBe("2026-01-01");
    expect(filterPerformancePoints(points, "ALL")).toBe(points);
  });

  test("clamps month ranges at month end", () => {
    const monthEndPoints = [
      { date: "2026-02-28", totalValue: 900, netExternalCashFlow: 0 },
      { date: "2026-03-01", totalValue: 950, netExternalCashFlow: 0 },
      { date: "2026-03-31", totalValue: 1_000, netExternalCashFlow: 0 },
    ];

    expect(filterPerformancePoints(monthEndPoints, "1M")[0].date).toBe("2026-02-28");
  });
});
