import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchPortfolioDashboard: vi.fn(),
  fetchCashDashboard: vi.fn(),
  fetchHistoricSecurities: vi.fn(),
}));

vi.mock("../../app/repositories/dashboard", () => ({
  backendApiBaseUrl: "http://api.test",
  fetchPortfolioDashboardFromBackend: mocks.fetchPortfolioDashboard,
}));

vi.mock("../../app/repositories/cash", () => ({
  fetchCashDashboardFromBackend: mocks.fetchCashDashboard,
}));

vi.mock("../../app/repositories/securities", () => ({
  fetchHistoricSecuritiesFromBackend: mocks.fetchHistoricSecurities,
}));

vi.mock("../../app/pages/homePage", () => ({
  HomePage: ({ dashboard }: { dashboard: { marker: string } }) => (
    <div>Home dashboard: {dashboard.marker}</div>
  ),
}));

vi.mock("../../app/pages/cashPage", () => ({
  CashPage: ({ dashboard }: { dashboard: { marker: string } }) => (
    <div>Cash dashboard: {dashboard.marker}</div>
  ),
}));

vi.mock("../../app/pages/securitiesPage", () => ({
  SecuritiesPage: ({ securities }: { securities: Array<{ symbol: string }> }) => (
    <div>Securities: {securities.map(({ symbol }) => symbol).join(", ")}</div>
  ),
}));

import HomeRoute from "../../app/page";
import CashRoute from "../../app/cash/page";
import SecuritiesRoute from "../../app/securities/page";

describe("server page orchestration", () => {
  beforeEach(() => {
    mocks.fetchPortfolioDashboard.mockReset();
    mocks.fetchCashDashboard.mockReset();
    mocks.fetchHistoricSecurities.mockReset();
  });

  test("the home page renders data for the authenticated session", async () => {
    mocks.fetchPortfolioDashboard.mockResolvedValue({ marker: "portfolio" });

    render(await HomeRoute());

    expect(mocks.fetchPortfolioDashboard).toHaveBeenCalledWith();
    expect(screen.getByText("Home dashboard: portfolio")).toBeInTheDocument();
  });

  test("the home page renders a useful backend error", async () => {
    mocks.fetchPortfolioDashboard.mockRejectedValue(new Error("Portfolio API unavailable"));

    render(await HomeRoute());

    expect(screen.getByText("Portfolio unavailable")).toBeInTheDocument();
    expect(screen.getByText("Portfolio API unavailable")).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/api\.test\/api\/portfolio\/dashboard/)).toBeInTheDocument();
  });

  test("the cash page renders fetched dashboard data", async () => {
    mocks.fetchCashDashboard.mockResolvedValue({ marker: "cash" });

    render(await CashRoute());

    expect(mocks.fetchCashDashboard).toHaveBeenCalledWith();
    expect(screen.getByText("Cash dashboard: cash")).toBeInTheDocument();
  });

  test("the cash page renders repository failures", async () => {
    mocks.fetchCashDashboard.mockRejectedValue(new Error("Cash API unavailable"));

    render(await CashRoute());

    expect(screen.getByText("Cash unavailable")).toBeInTheDocument();
    expect(screen.getByText("Cash API unavailable")).toBeInTheDocument();
  });

  test("the securities page renders authenticated user data", async () => {
    mocks.fetchHistoricSecurities.mockResolvedValue({
      securities: [{ symbol: "AAPL" }, { symbol: "SHOP" }],
    });

    render(await SecuritiesRoute());

    expect(mocks.fetchHistoricSecurities).toHaveBeenCalledWith();
    expect(screen.getByText("Securities: AAPL, SHOP")).toBeInTheDocument();
  });

  test("the securities page renders repository failures", async () => {
    mocks.fetchHistoricSecurities.mockRejectedValue(new Error("Securities API unavailable"));

    render(await SecuritiesRoute());

    expect(screen.getByText("Securities unavailable")).toBeInTheDocument();
    expect(screen.getByText("Securities API unavailable")).toBeInTheDocument();
  });
});
