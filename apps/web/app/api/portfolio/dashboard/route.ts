import { NextResponse } from "next/server";
import { fetchPortfolioDashboardFromBackend } from "../../../lib/api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? undefined;

  try {
    const dashboard = await fetchPortfolioDashboardFromBackend(userId);
    return NextResponse.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load portfolio dashboard.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
