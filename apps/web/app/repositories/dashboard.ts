import type { PortfolioDashboardDto } from "../lib/portfolioTypes";
import { backendApiBaseUrl, fetchJson } from "./http-client";

export { backendApiBaseUrl };

export async function fetchPortfolioDashboardFromBackend(): Promise<PortfolioDashboardDto> {
  return fetchJson(`${backendApiBaseUrl}/api/portfolio/dashboard`);
}
