import type {
  DividendDashboardSummaryDto,
  DividendTimelineRange,
} from "../lib/portfolio-types";
import { backendApiBaseUrl, fetchJson } from "./http-client";

type FetchDividendSummaryOptions = {
  userId?: string;
  timeline?: DividendTimelineRange;
  accountIds?: string[];
};

export async function fetchDividendSummaryFromBackend({
  userId,
  timeline = "ALL",
  accountIds,
}: FetchDividendSummaryOptions = {}): Promise<DividendDashboardSummaryDto> {
  const params = new URLSearchParams();

  params.set("timeline", timeline);
  if (userId) params.set("userId", userId);
  if (accountIds) params.set("accountIds", accountIds.join(","));

  return fetchJson(`${backendApiBaseUrl}/api/dividends/summary?${params.toString()}`);
}
