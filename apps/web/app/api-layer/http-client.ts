export const backendApiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:3001";

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `API request failed with ${response.status}`);
  }

  return response.json();
}
