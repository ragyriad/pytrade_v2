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

export type ProviderCalendarEvent = {
  eventType: string;
  eventDate: string;
  eventName: string | null;
  eventStatus: string | null;
  isEstimated: boolean;
  source: string;
  sourceEventId: string;
  providerTicker: string;
  symbol: string;
  currencyCode: string | null;
  cashAmount: number | null;
  exDate: string | null;
  paymentDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  frequency: string | null;
  distributionType: string | null;
  isSpecial: boolean;
  fiscalDateEnding: string | null;
  estimatedEps: number | null;
  reportedEps: number | null;
  rawData: Record<string, unknown>;
};

export type ProviderDividendEvent = {
  eventType: "dividend";
  eventDate: string;
  eventName: string | null;
  eventStatus: string | null;
  isEstimated: false;
  cashAmount: number;
  exDate: string;
} & ProviderCalendarEvent;

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
