import type { CashDashboardDto } from "../lib/portfolioTypes";
import { backendApiBaseUrl, fetchJson } from "./http-client";

export async function fetchCashDashboardFromBackend(): Promise<CashDashboardDto> {
  return fetchJson(`${backendApiBaseUrl}/api/cash/dashboard`);
}
