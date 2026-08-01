import type { PortfolioDashboardDto } from "../lib/portfolioTypes";
import { backendApiBaseUrl, fetchJson } from "./http-client";

export { backendApiBaseUrl };

export async function fetchPortfolioDashboardFromBackend(
  userId?: string
): Promise<PortfolioDashboardDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return fetchJson(`${backendApiBaseUrl}/api/portfolio/dashboard${params}`);
}
