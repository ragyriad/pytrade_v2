import { NextResponse } from "next/server";
import { fetchHistoricSecuritiesFromBackend } from "../../../repositories/securities";

export async function GET() {
  try {
    const history = await fetchHistoricSecuritiesFromBackend();
    return NextResponse.json(history);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load securities history.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
