import { requireEnv } from "../../env.js";

const ALPHA_VANTAGE_BASE_URL = "https://www.alphavantage.co/query";

export async function fetchAlphaVantageText(
  params: URLSearchParams
): Promise<string> {
  const url = new URL(ALPHA_VANTAGE_BASE_URL);
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("apikey", requireEnv("ALPHA_VANTAGE_API_KEY"));

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "text/csv, application/json" },
    });
  } catch (error) {
    const underlying =
      error instanceof Error && "cause" in error ? error.cause : null;
    const causeMessage =
      underlying instanceof Error ? underlying.message : "";
    const causeCode =
      underlying &&
      typeof underlying === "object" &&
      "code" in underlying &&
      typeof underlying.code === "string"
        ? underlying.code
        : "";
    const detail = [causeCode, causeMessage].filter(Boolean).join(" - ");
    throw new Error(
      `Alpha Vantage network request failed${detail ? `: ${detail}` : ""}`,
      {
      cause: error,
      }
    );
  }
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Alpha Vantage request failed (${response.status}): ${body.slice(0, 500)}`
    );
  }

  if (body.trimStart().startsWith("{")) {
    const payload = JSON.parse(body) as Record<string, unknown>;
    const message =
      payload.Information ?? payload.Note ?? payload["Error Message"];
    if (message) throw new Error(`Alpha Vantage request failed: ${message}`);
  }

  return body;
}
