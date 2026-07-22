export const STATEMENT_SOURCE = "questrade_statement" as const;

export type AssetCategory = "CASH" | "STOCK" | "ETF" | "ADR" | "OPTION";
export type CurrencyCode = "CAD" | "USD";
export type IssueSeverity = "ERROR" | "WARNING";

export interface StatementSnapshot {
  statement_key: string;
  source: typeof STATEMENT_SOURCE;
  source_file: string;
  account_number: string;
  account_type: string;
  statement_date: string;
  current_fx_usd_cad: number | null;
  total_market_value_cad: number | null;
  total_position_cost_cad: number | null;
  total_cash_cad: number | null;
  total_book_value_cad: number | null;
  owned_balance_cad: number | null;
  borrowed_balance_cad: number | null;
  total_balance_cad: number | null;
}

export interface CashBalanceSnapshot {
  statement_key: string;
  source: typeof STATEMENT_SOURCE;
  source_file: string;
  account_number: string;
  account_type: string;
  statement_date: string;
  currency_code: CurrencyCode;
  owned_amount: number;
  borrowed_amount: number;
  total_amount: number;
  combined_value_cad: number | null;
}

export interface HoldingSnapshot {
  statement_key: string;
  source: typeof STATEMENT_SOURCE;
  source_file: string;
  source_page: number;
  account_number: string;
  account_type: string;
  statement_date: string;
  category: Exclude<AssetCategory, "CASH">;
  currency_code: CurrencyCode;
  asset_type: "SECURITY" | "OPTION";
  option_type: "PUT" | "CALL" | null;
  raw_symbol: string;
  symbol: string;
  description: string;
  cost_basis: string | null;
  quantity: number | null;
  segregated_quantity: number | null;
  cost_per_share: number | null;
  position_cost: number | null;
  market_price: number | null;
  market_value: number | null;
  unrealized_pnl: number | null;
  return_percent: number | null;
  portfolio_percent: number | null;
}

export interface StatementTransaction {
  import_key: string;
  statement_key: string;
  source: typeof STATEMENT_SOURCE;
  source_file: string;
  source_page: number;
  statement_row_index: number;
  account_number: string;
  account_type: string;
  statement_date: string;
  transaction_date: string;
  settlement_date: string;
  raw_activity_type: string;
  activity_type: string;
  normalized_type: string;
  asset_type: "SECURITY" | "OPTION" | "CURRENCY" | "CASH";
  option_type: "PUT" | "CALL" | null;
  raw_symbol: string;
  symbol: string;
  description: string;
  record_date: string | null;
  payment_date: string | null;
  currency_code: CurrencyCode | null;
  quantity: number | null;
  price: number | null;
  gross_amount: number | null;
  commission: number | null;
  net_amount: number | null;
  fx_rate: number | null;
  cad_price: number | null;
  cad_gross_amount: number | null;
  cad_commission: number | null;
  cad_net_amount: number | null;
  usd_price: number | null;
  usd_gross_amount: number | null;
  usd_commission: number | null;
  usd_net_amount: number | null;
  raw_text: string;
}

export interface ImportIssue {
  severity: IssueSeverity;
  source_file: string;
  source_page: number | null;
  statement_key: string;
  entity: string;
  message: string;
  raw_text: string;
}

export interface ExtractedStatementData {
  statements: StatementSnapshot[];
  cashBalances: CashBalanceSnapshot[];
  holdings: HoldingSnapshot[];
  transactions: StatementTransaction[];
  issues: ImportIssue[];
}

export interface ExtractionSummary {
  pdfFiles: number;
  statements: number;
  cashBalances: number;
  holdings: number;
  transactions: number;
  errors: number;
  warnings: number;
}
