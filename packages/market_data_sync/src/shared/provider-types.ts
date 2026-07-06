import type { Security } from "@repo/db";

export type MarketDataSecurity = Pick<
  Security,
  | "id"
  | "symbol"
  | "rawSymbol"
  | "currencyCode"
  | "exchangeCode"
  | "exchangeMicCode"
  | "exchangeName"
>;

export type DateRange = {
  from?: string;
  to?: string;
};

export type ProviderDividendEvent = {
  source: string;
  sourceEventId: string;
  providerTicker: string;
  symbol: string;
  currencyCode: string | null;
  cashAmount: number;
  exDate: string;
  paymentDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  frequency: string | null;
  distributionType: string | null;
  isSpecial: boolean;
  rawData: Record<string, unknown>;
};

export type ProviderPriceSnapshot = {
  source: string;
  providerTicker: string;
  symbol: string;
  currencyCode: string | null;
  priceDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjustedClose: number | null;
  volume: number | null;
  rawData: Record<string, unknown>;
};

export type ProviderForexRateSnapshot = {
  source: string;
  providerTicker: string;
  baseCurrency: string;
  quoteCurrency: string;
  rateDate: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  adjustedClose: number | null;
  rawData: Record<string, unknown>;
};
