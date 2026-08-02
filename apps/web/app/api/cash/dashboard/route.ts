import { NextResponse } from "next/server";
import { fetchCashDashboardFromBackend } from "../../../repositories/cash";

export async function GET() {
  try {
    const dashboard = await fetchCashDashboardFromBackend();
    return NextResponse.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load cash dashboard.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
