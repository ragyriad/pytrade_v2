import type {
  SecuritiesHistoryResponseDto,
  SecurityTransactionsResponseDto,
} from "../lib/portfolioTypes";
import { backendApiBaseUrl, fetchJson } from "./http-client";

export async function fetchHistoricSecuritiesFromBackend(): Promise<SecuritiesHistoryResponseDto> {
  return fetchJson(`${backendApiBaseUrl}/api/securities/history`);
}

export async function fetchSecurityTransactionsFromBackend(
  securityId: string
): Promise<SecurityTransactionsResponseDto> {
  return fetchJson(
    `${backendApiBaseUrl}/api/securities/${securityId}/transactions`
  );
}
