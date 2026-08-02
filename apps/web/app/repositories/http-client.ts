import "server-only";

import { auth } from "@clerk/nextjs/server";

export const backendApiBaseUrl = process.env.API_BASE_URL ?? "http://127.0.0.1:3001";

export async function fetchJson<T>(url: string): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) throw new Error("Authentication required.");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `API request failed with ${response.status}`);
  }

  return response.json();
}
