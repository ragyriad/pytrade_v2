import { NextResponse } from "next/server";
import { fetchCashDashboardFromBackend } from "../../../repositories/cash";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? undefined;

  try {
    const dashboard = await fetchCashDashboardFromBackend(userId);
    return NextResponse.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load cash dashboard.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
