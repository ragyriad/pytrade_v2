import type { CashDashboardDto } from "../lib/portfolio-types";
import { backendApiBaseUrl, fetchJson } from "./http-client";

export async function fetchCashDashboardFromBackend(
  userId?: string
): Promise<CashDashboardDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return fetchJson(`${backendApiBaseUrl}/api/cash/dashboard${params}`);
}
