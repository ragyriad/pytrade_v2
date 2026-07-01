export type DividendProviderEvent = {
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

export type DividendProviderDateRange = {
  startExDate?: string;
  endExDate?: string;
};
