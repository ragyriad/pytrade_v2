import { NextResponse } from "next/server";

const apiHealthUrl = `http://127.0.0.1:${process.env.API_PORT ?? "3001"}/health`;

export async function GET() {
  try {
    const response = await fetch(apiHealthUrl, { cache: "no-store" });
    if (!response.ok) {
      return NextResponse.json({ status: "unhealthy" }, { status: 503 });
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "unhealthy" }, { status: 503 });
  }
}
