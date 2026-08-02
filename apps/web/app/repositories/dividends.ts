import type {
  DividendDashboardSummaryDto,
  DividendTimelineRange,
} from "../lib/portfolioTypes";
import { backendApiBaseUrl, fetchJson } from "./http-client";

type FetchDividendSummaryOptions = {
  timeline?: DividendTimelineRange;
  accountIds?: string[];
};

export async function fetchDividendSummaryFromBackend({
  timeline = "ALL",
  accountIds,
}: FetchDividendSummaryOptions = {}): Promise<DividendDashboardSummaryDto> {
  const params = new URLSearchParams();

  params.set("timeline", timeline);
  if (accountIds) params.set("accountIds", accountIds.join(","));

  return fetchJson(`${backendApiBaseUrl}/api/dividends/summary?${params.toString()}`);
}
