export type MoneyDto = {
  amount: number;
  currency: string;
};

export type MoneyBreakdownDto = {
  amount: number;
  currency: string;
};

export type AccountDto = {
  id: string;
  name: string;
  institutionName: string | null;
  type: string | null;
  status: string | null;
  balance: MoneyDto;
  lastSyncedAt: string | null;
};

export type PositionDto = {
  id: string;
  accountId: string;
  symbol: string;
  description: string | null;
  units: number;
  price: MoneyDto | null;
  marketValue: MoneyDto;
  averagePurchasePrice: MoneyDto | null;
  unrealizedGainLoss: MoneyDto | null;
  assetType: string | null;
  isCashEquivalent: boolean;
};

export type TransactionDto = {
  id: string;
  accountId: string;
  accountName?: string | null;
  brokerageName?: string | null;
  accountType?: string | null;
  securityId?: string | null;
  source: string;
  type: string;
  description: string | null;
  amount: MoneyDto;
  fee: MoneyDto;
  price: MoneyDto | null;
  units: number | null;
  symbol: string | null;
  tradeDate: string;
};

export type AllocationDto = {
  label: string;
  value: number;
  percentage: number;
};

export type DividendGroupDto = {
  id: string;
  label: string;
  brokerageName: string | null;
  accountType: string | null;
  totalByCurrency: MoneyBreakdownDto[];
  transactionCount: number;
};

export type DividendSummaryDto = {
  totalByCurrency: MoneyBreakdownDto[];
  byAccount: DividendGroupDto[];
  byBrokerage: DividendGroupDto[];
  transactions: TransactionDto[];
};

export type FeeSummaryDto = {
  totalByCurrency: MoneyBreakdownDto[];
  transactions: TransactionDto[];
};

export type PortfolioDashboardDto = {
  summary: {
    user: {
      id: string;
      username: string;
    };
    totalValue: MoneyDto;
    totalValueByCurrency: MoneyBreakdownDto[];
    totalUnrealizedGainLoss: MoneyDto;
    totalUnrealizedGainLossByCurrency: MoneyBreakdownDto[];
    accountCount: number;
    positionCount: number;
    transactionCount: number;
    lastSyncedAt: string | null;
  };
  accounts: AccountDto[];
  positions: PositionDto[];
  transactions: TransactionDto[];
  recentTransactions: TransactionDto[];
  allocationByAssetType: AllocationDto[];
  allocationByAccount: AllocationDto[];
  dividends: DividendSummaryDto;
  fees: FeeSummaryDto;
};

export type DashboardTab = "accounts" | "positions" | "transactions";

export type HistoricSecurityDto = {
  id: string;
  securityKey: string;
  snaptradeSymbolId: string | null;
  symbol: string;
  rawSymbol: string | null;
  description: string | null;
  currencyCode: string | null;
  exchangeCode: string | null;
  exchangeMicCode: string | null;
  exchangeName: string | null;
  instrumentType: string | null;
  figiCode: string | null;
  logoUrl: string | null;
  transactionCount: number;
  buyCount: number;
  sellCount: number;
  dividendCount: number;
  totalGainLoss: MoneyDto;
  totalGainLossPercent: number | null;
  firstTradeDate: string | null;
  lastTradeDate: string | null;
  status: "active" | "closed";
};

export type SecuritiesHistoryResponseDto = {
  securities: HistoricSecurityDto[];
};

export type SecurityTransactionsResponseDto = {
  security: HistoricSecurityDto;
  transactions: TransactionDto[];
};
