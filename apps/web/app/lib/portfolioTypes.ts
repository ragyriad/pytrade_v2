export type MoneyDto = {
  amount: number;
  currency: string;
};

export type MoneyBreakdownDto = {
  amount: number;
  currency: string;
};

export type AccountType = string;

export type AccountDto = {
  id: string;
  brokerageAccountNumber?: string | null;
  linkedAccountId?: string | null;
  name: string;
  institutionName: string | null;
  accountCurrency?: string | null;
  type: AccountType | null;
  subType?: string | null;
  management?: string | null;
  snaptradeUnifiedAccountType?: string | null;
  isRegistered?: boolean;
  status: string | null;
  isInvestmentAccount?: boolean;
  balance: MoneyDto;
  lastSyncedAt: string | null;
};

export type PositionDto = {
  id: string;
  accountId: string;
  securityId: string | null;
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
  underlyingSecurityId?: string | null;
  optionId?: string | null;
  optionTicker?: string | null;
  optionExpirationDate?: string | null;
  optionContractType?: string | null;
  source: string;
  type: string;
  action: string | null;
  optionAction?: string | null;
  assetType: string | null;
  description: string | null;
  amount: MoneyDto;
  fee: MoneyDto;
  price: MoneyDto | null;
  units: number | null;
  symbol: string | null;
  tradeDate: string;
  isArchived: boolean;
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

export type DividendTimelineRange =
  | "NONE"
  | "1M"
  | "3M"
  | "6M"
  | "1Y"
  | "2Y"
  | "5Y"
  | "ALL";

export type PercentBreakdownDto = {
  currency: string;
  percent: number | null;
};

export type DividendAccountShareDto = {
  id: string;
  label: string;
  value: number;
  percentage: number;
  currency: string;
};

export type DividendAccountShareGroupDto = {
  currency: string;
  total: number;
  rows: DividendAccountShareDto[];
};

export type DividendPositionYieldDto = {
  id: string;
  symbol: string;
  description: string | null;
  accountId: string | null;
  units: number;
  accountSegments: Array<{
    accountId: string;
    dividendAmount: MoneyBreakdownDto;
  }>;
  dividendAmount: MoneyBreakdownDto;
  annualizedDividendAmount: MoneyBreakdownDto;
  marketValue: MoneyBreakdownDto;
  costBasis: MoneyBreakdownDto;
  costPerUnit: MoneyBreakdownDto;
  dividendPerShare: MoneyBreakdownDto;
  annualizedDividendPerShare: MoneyBreakdownDto;
  yieldOnCostPercent: number;
};

export type DividendYieldingPositionDto = {
  id: string;
  symbol: string;
  description: string | null;
  accountId: string;
  status: "open" | "closed";
  totalDividends: MoneyBreakdownDto;
  currentYieldPercent: number | null;
  yieldOnCostPercent: number | null;
};

export type DividendCalendarEventDto = {
  id: string;
  securityId: string | null;
  symbol: string;
  providerTicker: string;
  source: string;
  cashAmount: MoneyBreakdownDto;
  exDate: string;
  paymentDate: string | null;
  recordDate: string | null;
  declarationDate: string | null;
  frequency: string | null;
  distributionType: string | null;
  isSpecial: boolean;
};

export type CalendarEventDto = {
  id: string;
  securityId: string | null;
  eventType: string;
  eventDate: string;
  eventName: string | null;
  eventStatus: string | null;
  isEstimated: boolean;
  providerSource: string;
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
};

export type DividendSummaryMetricsDto = {
  totalDividends: MoneyBreakdownDto[];
  annualIncome: MoneyBreakdownDto[];
  monthlyIncome: MoneyBreakdownDto[];
  currentYieldByCurrency: PercentBreakdownDto[];
  yieldOnCostByCurrency: PercentBreakdownDto[];
};

export type DividendDashboardSummaryDto = {
  timeline: DividendTimelineRange;
  metrics: DividendSummaryMetricsDto;
  accountShareGroups: DividendAccountShareGroupDto[];
  positionYields: DividendPositionYieldDto[];
  positionRows: DividendYieldingPositionDto[];
  transactions: TransactionDto[];
  calendarEvents: DividendCalendarEventDto[];
};

export type FeeSummaryDto = {
  totalByCurrency: MoneyBreakdownDto[];
  transactions: TransactionDto[];
};

export type PerformancePointDto = {
  date: string;
  totalValue: number;
  netExternalCashFlow: number;
};

export type PerformanceSeriesDto = {
  accountId: string;
  currency: string;
  points: PerformancePointDto[];
};

export type PerformanceSummaryDto = {
  series: PerformanceSeriesDto[];
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
  performance: PerformanceSummaryDto | null;
};

export type DashboardTab = "accounts" | "securities" | "transactions";

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
  listingStatus: "ACTIVE" | "DELISTED";
  delistedAt: string | null;
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

export type CashAccountDto = {
  id: string;
  name: string;
  institutionName: string | null;
  accountCurrency: string | null;
  type: AccountType | null;
  subType?: string | null;
  management?: string | null;
  snaptradeUnifiedAccountType?: string | null;
  isRegistered?: boolean;
  status: string | null;
  category: "cash" | "credit";
  balance: MoneyDto;
  balances: MoneyDto[];
  creditLimit: MoneyDto | null;
  lastSyncedAt: string | null;
};

export type CashTransactionDto = {
  id: string;
  accountId: string;
  source: string;
  type: string;
  action: string | null;
  assetType: string | null;
  description: string | null;
  amount: MoneyDto;
  fee: MoneyDto;
  symbol: string | null;
  tradeDate: string;
  isArchived: boolean;
};

export type CalculatedCreditCardBalanceDto = {
  accountId: string;
  currency: string;
  netAmount: number;
  amountOwing: number;
  creditAmount: number;
  creditLimit: number | null;
  charges: number;
  returns: number;
  payments: number;
  status: "owing" | "credit" | "paid";
  calculatedThrough: string | null;
  firstActivityDate: string | null;
};

export type CashDashboardDto = {
  accounts: CashAccountDto[];
  cashAccounts: CashAccountDto[];
  creditAccounts: CashAccountDto[];
  cashTransactions: CashTransactionDto[];
  expenses: CashTransactionDto[];
  debitAccountExpenses: CashTransactionDto[];
  creditCardExpenses: CashTransactionDto[];
  creditCardBalances: CalculatedCreditCardBalanceDto[];
  unallocatedCreditCardPayments: MoneyBreakdownDto[];
  totalCash: MoneyBreakdownDto[];
  totalCreditBalance: MoneyBreakdownDto[];
  currentInterestRates: Array<{
    currency: string;
    percent: number | null;
  }>;
};
