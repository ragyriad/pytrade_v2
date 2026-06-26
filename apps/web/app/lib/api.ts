import type {
  PortfolioDashboardDto,
  SecuritiesHistoryResponseDto,
  SecurityTransactionsResponseDto,
} from "./portfolio-types";

const backendApiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function fetchPortfolioDashboardFromBackend(
  userId?: string
): Promise<PortfolioDashboardDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(
    `${backendApiBaseUrl}/api/portfolio/dashboard${params}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `API request failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchHistoricSecuritiesFromBackend(
  userId?: string
): Promise<SecuritiesHistoryResponseDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(`${backendApiBaseUrl}/api/securities/history${params}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `API request failed with ${response.status}`);
  }

  return response.json();
}

export async function fetchSecurityTransactionsFromBackend(
  securityId: string,
  userId?: string
): Promise<SecurityTransactionsResponseDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const response = await fetch(
    `${backendApiBaseUrl}/api/securities/${securityId}/transactions${params}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `API request failed with ${response.status}`);
  }

  return response.json();
}
