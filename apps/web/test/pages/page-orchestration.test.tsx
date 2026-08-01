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
  SecuritiesPage: ({
    securities,
    userId,
  }: {
    securities: Array<{ symbol: string }>;
    userId?: string;
  }) => <div>Securities: {securities.map(({ symbol }) => symbol).join(", ")} / {userId}</div>,
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

  test("the home page forwards the selected user and renders fetched data", async () => {
    mocks.fetchPortfolioDashboard.mockResolvedValue({ marker: "portfolio" });

    render(await HomeRoute({ searchParams: { userId: "user-1" } }));

    expect(mocks.fetchPortfolioDashboard).toHaveBeenCalledWith("user-1");
    expect(screen.getByText("Home dashboard: portfolio")).toBeInTheDocument();
  });

  test("the home page renders a useful backend error", async () => {
    mocks.fetchPortfolioDashboard.mockRejectedValue(new Error("Portfolio API unavailable"));

    render(await HomeRoute({ searchParams: {} }));

    expect(screen.getByText("Portfolio unavailable")).toBeInTheDocument();
    expect(screen.getByText("Portfolio API unavailable")).toBeInTheDocument();
    expect(screen.getByText(/http:\/\/api\.test\/api\/portfolio\/dashboard/)).toBeInTheDocument();
  });

  test("the cash page renders fetched dashboard data", async () => {
    mocks.fetchCashDashboard.mockResolvedValue({ marker: "cash" });

    render(await CashRoute({ searchParams: { userId: "user-2" } }));

    expect(mocks.fetchCashDashboard).toHaveBeenCalledWith("user-2");
    expect(screen.getByText("Cash dashboard: cash")).toBeInTheDocument();
  });

  test("the cash page renders repository failures", async () => {
    mocks.fetchCashDashboard.mockRejectedValue(new Error("Cash API unavailable"));

    render(await CashRoute({ searchParams: {} }));

    expect(screen.getByText("Cash unavailable")).toBeInTheDocument();
    expect(screen.getByText("Cash API unavailable")).toBeInTheDocument();
  });

  test("the securities page forwards securities and user context", async () => {
    mocks.fetchHistoricSecurities.mockResolvedValue({
      securities: [{ symbol: "AAPL" }, { symbol: "SHOP" }],
    });

    render(await SecuritiesRoute({ searchParams: { userId: "user-3" } }));

    expect(mocks.fetchHistoricSecurities).toHaveBeenCalledWith("user-3");
    expect(screen.getByText("Securities: AAPL, SHOP / user-3")).toBeInTheDocument();
  });

  test("the securities page renders repository failures", async () => {
    mocks.fetchHistoricSecurities.mockRejectedValue(new Error("Securities API unavailable"));

    render(await SecuritiesRoute({ searchParams: {} }));

    expect(screen.getByText("Securities unavailable")).toBeInTheDocument();
    expect(screen.getByText("Securities API unavailable")).toBeInTheDocument();
  });
});
