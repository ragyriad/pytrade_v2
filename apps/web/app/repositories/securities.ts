import type {
  SecuritiesHistoryResponseDto,
  SecurityTransactionsResponseDto,
} from "../lib/portfolio-types";
import { backendApiBaseUrl, fetchJson } from "./http-client";

export async function fetchHistoricSecuritiesFromBackend(
  userId?: string
): Promise<SecuritiesHistoryResponseDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return fetchJson(`${backendApiBaseUrl}/api/securities/history${params}`);
}

export async function fetchSecurityTransactionsFromBackend(
  securityId: string,
  userId?: string
): Promise<SecurityTransactionsResponseDto> {
  const params = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  return fetchJson(
    `${backendApiBaseUrl}/api/securities/${securityId}/transactions${params}`
  );
}
