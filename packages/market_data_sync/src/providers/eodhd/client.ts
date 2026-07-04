import { requireEnv } from "../../env.js";
import { EodhdHttpError } from "./errors.js";

const EODHD_BASE_URL = "https://eodhd.com";

export async function fetchEodhdJson<T>(
  path: string,
  params: URLSearchParams = new URLSearchParams()
): Promise<T> {
  const url = new URL(path, EODHD_BASE_URL);

  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("api_token", requireEnv("EODHD_TOKEN"));
  url.searchParams.set("fmt", "json");

  const response = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new EodhdHttpError(response.status, body);
  }

  const body = await response.text();
  const parsed = JSON.parse(body || "null") as unknown;

  if (parsed && typeof parsed === "object" && "errors" in parsed) {
    throw new Error(`EODHD request failed: ${JSON.stringify(parsed)}`);
  }

  return parsed as T;
}
