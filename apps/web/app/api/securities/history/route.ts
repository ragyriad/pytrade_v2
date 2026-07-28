import { NextResponse } from "next/server";
import { fetchHistoricSecuritiesFromBackend } from "../../../repositories/securities";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") ?? undefined;

  try {
    const history = await fetchHistoricSecuritiesFromBackend(userId);
    return NextResponse.json(history);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load securities history.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
