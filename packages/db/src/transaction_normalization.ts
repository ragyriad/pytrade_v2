type SecurityLike = {
  symbol?: string | null;
  rawSymbol?: string | null;
  raw_symbol?: string | null;
  description?: string | null;
  instrumentTypeCode?: string | null;
  instrument_type_code?: string | null;
  instrumentTypeDescription?: string | null;
  instrument_type_description?: string | null;
};

type TransactionLike = {
  type?: string | null;
  description?: string | null;
  symbol?: string | null;
  units?: string | number | null;
  amount?: string | number | null;
};

export type TransactionNormalizationOptions = {
  accountType?: string | null;
};

export type NormalizedTransaction = {
  action: string;
  assetType: string;
};

const optionSymbolPattern = /^[A-Z]+\d{1,2}[A-Z]{3}\d{2}[CP]\d+(?:\.\d+)?$/i;
const occOptionSymbolPattern = /^[A-Z]{1,6}\d{6}[CP]\d{8}$/i;
const spacedOptionPattern =
  /\b[A-Z]{1,6}\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+(PUTS?|CALLS?)\s+\d+(?:\.\d+)?\b/i;
const sideFirstOptionPattern =
  /\b(PUTS?|CALLS?)\s+[A-Z]{1,6}\s+(\d{1,2}[A-Z]{3}\d{2}|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\s+\d+(?:\.\d+)?\b/i;

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, " ") ?? "";
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isCashAccount(accountType: string | null | undefined): boolean {
  const normalized = normalizeText(accountType);
  return normalized === "CASH" || normalized === "CASH_USD" || normalized === "CASH_CAD";
}

function isOptionSymbol(value: string): boolean {
  return optionSymbolPattern.test(value) || occOptionSymbolPattern.test(value);
}

function hasOptionEvidence(value: string): boolean {
  return (
    optionSymbolPattern.test(value) ||
    occOptionSymbolPattern.test(value) ||
    spacedOptionPattern.test(value) ||
    sideFirstOptionPattern.test(value)
  );
}

function securityValue(
  security: SecurityLike | null | undefined,
  camelKey: keyof SecurityLike,
  snakeKey: keyof SecurityLike
): string {
  return normalizeText(
    (security?.[camelKey] as string | null | undefined) ??
      (security?.[snakeKey] as string | null | undefined)
  );
}

export function normalizeTransaction(
  transaction: TransactionLike,
  security?: SecurityLike | null,
  options: TransactionNormalizationOptions = {}
): NormalizedTransaction {
  const sourceType = normalizeText(transaction.type);
  const description = normalizeText(transaction.description);
  const combined = `${sourceType} ${description}`;
  const cashAccount = isCashAccount(options.accountType);
  const units = toNumber(transaction.units);
  const amount = toNumber(transaction.amount);

  let action = sourceType || "OTHER";
  if (combined.includes("DIVIDEND")) action = "DIVIDEND";
  else if (combined.includes("INTEREST")) action = "INTEREST";
  else if (combined.includes("REIMBURSEMENT") || combined.includes("REFUND") || sourceType === "REFUND") action = "REIMBURSEMENT";
  else if (combined.includes("PROMOTION")) action = "PROMOTION";
  else if (combined.includes("SPEND")) action = "SPEND";
  else if (combined.includes("CONTRIBUTION")) action = "CONTRIBUTION";
  else if (combined.includes("WITHDRAW")) action = "WITHDRAWAL";
  else if (combined.includes("DEPOSIT")) action = "DEPOSIT";
  else if (combined.includes("TRANSFER") || combined.includes("P2P")) action = "TRANSFER";
  else if (combined.includes("FEE") || combined.includes("COMMISSION")) action = "FEE";
  else if (combined.includes("SELL") || combined.includes("SOLD")) action = "SELL";
  else if (combined.includes("BUY") || combined.includes("BOUGHT")) action = "BUY";
  else if (units != null && units < 0) action = "SELL";
  else if (units != null && units > 0 && amount != null && amount < 0) action = "BUY";
  else if (sourceType === "OTHER") action = "OTHER";

  const instrumentCode = securityValue(security, "instrumentTypeCode", "instrument_type_code");
  const instrumentDescription = securityValue(
    security,
    "instrumentTypeDescription",
    "instrument_type_description"
  );
  const securitySymbol = securityValue(security, "symbol", "symbol");
  const rawSecuritySymbol = securityValue(security, "rawSymbol", "raw_symbol");
  const transactionSymbol = normalizeText(transaction.symbol);

  let assetType = "OTHER";
  if (cashAccount) {
    assetType = "CASH";
    if (action === "CONTRIBUTION") action = "DEPOSIT";
  } else if (action === "INTEREST") {
    assetType = "INTEREST";
  } else if (action === "REIMBURSEMENT") {
    assetType = "CASH";
  } else if (
    isOptionSymbol(transactionSymbol) ||
    isOptionSymbol(securitySymbol) ||
    isOptionSymbol(rawSecuritySymbol) ||
    hasOptionEvidence(description) ||
    hasOptionEvidence(securityValue(security, "description", "description")) ||
    instrumentCode === "OPT"
  ) {
    assetType = "OPTION";
  } else if (
    instrumentDescription === "ETF" ||
    instrumentCode === "ETF" ||
    description.includes("ETF") ||
    description.includes("EXCHANGE TRADED FUND") ||
    instrumentDescription.includes("ETF") ||
    instrumentDescription.includes("EXCHANGE TRADED FUND")
  ) {
    assetType = "ETF";
  } else if (
    instrumentDescription === "STOCK" ||
    description.includes("COMMON STOCK") ||
    description.includes("DEPOSITARY") ||
    description.includes("SHARES") ||
    /\bSHS\b/.test(description) ||
    instrumentDescription.includes("COMMON STOCK") ||
    instrumentDescription.includes("DEPOSITARY") ||
    instrumentDescription.includes("SHARES") ||
    instrumentDescription.includes("EQUITY") ||
    instrumentCode === "CS" ||
    instrumentCode === "EQUITY" ||
    instrumentCode === "STOCK"
  ) {
    assetType = "STOCK";
  } else if (["DEPOSIT", "WITHDRAWAL", "CONTRIBUTION", "TRANSFER", "FEE"].includes(action)) {
    assetType = "CASH";
  } else if (action === "DIVIDEND") {
    assetType = security ? "STOCK" : "DIVIDEND";
  }

  return { action, assetType };
}
