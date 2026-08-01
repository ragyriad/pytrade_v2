import { NextResponse } from "next/server";
import { fetchDividendSummaryFromBackend } from "../../../repositories/dividends";
import type { DividendTimelineRange } from "../../../lib/portfolioTypes";

const timelineValues = new Set<DividendTimelineRange>([
  "NONE",
  "1M",
  "3M",
  "6M",
  "1Y",
  "2Y",
  "5Y",
  "ALL",
]);

function parseTimeline(value: string | null): DividendTimelineRange {
  return value && timelineValues.has(value as DividendTimelineRange)
    ? (value as DividendTimelineRange)
    : "ALL";
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? undefined;
  const accountIdsParam = url.searchParams.get("accountIds");
  const accountIds =
    accountIdsParam == null ? undefined : accountIdsParam.split(",").filter(Boolean);

  try {
    const summary = await fetchDividendSummaryFromBackend({
      userId,
      timeline: parseTimeline(url.searchParams.get("timeline")),
      accountIds,
    });

    return NextResponse.json(summary);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load dividend summary.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
