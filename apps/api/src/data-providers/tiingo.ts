import type {
  DividendProviderDateRange,
  DividendProviderEvent,
} from "./dividend-provider.js";

const TIINGO_BASE_URL = "https://api.tiingo.com";
const TIINGO_SOURCE = "TIINGO";

type TiingoDistribution = {
  permaTicker?: string | null;
  ticker?: string | null;
  exDate: string;
  paymentDate?: string | null;
  recordDate?: string | null;
  declarationDate?: string | null;
  distribution: number | string;
  distributionFreqency?: string | null;
  distributionFrequency?: string | null;
  distributionType?: string | null;
  currency?: string | null;
};

type TiingoDistributionYield = {
  date: string;
  trailingDiv1Y?: string | number | null;
  [key: string]: unknown;
};

function getTiingoToken(): string {
  const token = process.env.TIINGO_API_TOKEN;
  if (!token) throw new Error("Missing required environment variable: TIINGO_API_TOKEN");
  return token;
}

function toDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function toNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid Tiingo distribution amount: ${value}`);
  }
  return parsed;
}

function buildSourceEventId(row: TiingoDistribution, fallbackTicker: string): string {
  const ticker = row.ticker ?? fallbackTicker;
  const exDate = toDateOnly(row.exDate) ?? row.exDate;
  const amount = String(row.distribution);
  const permaTicker = row.permaTicker ?? ticker;
  return `${permaTicker}:${ticker}:${exDate}:${amount}`;
}

async function fetchTiingoJson<T>(path: string, params: URLSearchParams): Promise<T> {
  const url = new URL(path, TIINGO_BASE_URL);
  for (const [key, value] of params.entries()) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      Authorization: `Token ${getTiingoToken()}`,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Tiingo request failed with ${response.status}${body ? `: ${body}` : ""}`
    );
  }

  return response.json() as Promise<T>;
}

export async function fetchTiingoDistributions(
  ticker: string,
  range: DividendProviderDateRange = {}
): Promise<TiingoDistribution[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const params = new URLSearchParams();

  if (range.startExDate) params.set("startExDate", range.startExDate);
  if (range.endExDate) params.set("endExDate", range.endExDate);

  return fetchTiingoJson<TiingoDistribution[]>(
    `/tiingo/corporate-actions/${encodeURIComponent(normalizedTicker)}/distributions`,
    params
  );
}

export async function fetchTiingoDistributionYield(
  ticker: string
): Promise<TiingoDistributionYield[]> {
  const normalizedTicker = ticker.trim().toUpperCase();

  return fetchTiingoJson<TiingoDistributionYield[]>(
    `/tiingo/corporate-actions/${encodeURIComponent(normalizedTicker)}/distribution-yield`,
    new URLSearchParams()
  );
}

export async function fetchTiingoDividendEvents(
  ticker: string,
  range: DividendProviderDateRange = {}
): Promise<DividendProviderEvent[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const rows = await fetchTiingoDistributions(normalizedTicker, range);

  return rows.map((row) => {
    const cashAmount = toNumber(row.distribution);
    const frequency = row.distributionFrequency ?? row.distributionFreqency ?? null;
    const distributionType = row.distributionType ?? null;

    return {
      source: TIINGO_SOURCE,
      sourceEventId: buildSourceEventId(row, normalizedTicker),
      providerTicker: row.ticker ?? normalizedTicker,
      symbol: row.ticker ?? normalizedTicker,
      currencyCode: row.currency ?? null,
      cashAmount,
      exDate: toDateOnly(row.exDate) ?? row.exDate,
      paymentDate: toDateOnly(row.paymentDate),
      recordDate: toDateOnly(row.recordDate),
      declarationDate: toDateOnly(row.declarationDate),
      frequency,
      distributionType,
      isSpecial:
        distributionType?.toLowerCase().includes("special") ??
        frequency === "ir",
      rawData: row as Record<string, unknown>,
    };
  });
}
