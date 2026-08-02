import { NextResponse } from "next/server";
import { fetchPortfolioDashboardFromBackend } from "../../../repositories/dashboard";

export async function GET() {
  try {
    const dashboard = await fetchPortfolioDashboardFromBackend();
    return NextResponse.json(dashboard);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load portfolio dashboard.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
