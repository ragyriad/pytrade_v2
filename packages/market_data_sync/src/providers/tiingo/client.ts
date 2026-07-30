import { requireEnv } from "../../env.js";
import { TiingoHttpError } from "./errors.js";

const TIINGO_BASE_URL = "https://api.tiingo.com";

export async function fetchTiingoJson<T>(
  path: string,
  params: URLSearchParams = new URLSearchParams()
): Promise<T> {
  const url = new URL(path, TIINGO_BASE_URL);

  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Token ${requireEnv("TIINGO_API_TOKEN")}`,
      },
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
      `Tiingo network request failed${detail ? `: ${detail}` : ""}`,
      { cause: error }
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new TiingoHttpError(response.status, body);
  }

  return response.json() as Promise<T>;
}
