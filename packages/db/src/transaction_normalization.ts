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

function normalizeActionText(value: string): string {
  return value.replace(/[_-]/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasTerm(value: string, term: string): boolean {
  return new RegExp(`\\b${escapeRegExp(term)}\\b`).test(value);
}

function hasAnyTerm(value: string, terms: string[]): boolean {
  return terms.some((term) => hasTerm(value, term));
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
  const sourceActionText = normalizeActionText(sourceType);
  const description = normalizeText(transaction.description);
  const combined = `${sourceActionText} ${description}`;
  const cashAccount = isCashAccount(options.accountType);
  const units = toNumber(transaction.units);
  const amount = toNumber(transaction.amount);

  let action = sourceType || "OTHER";
  if (sourceActionText === "BUY" || sourceActionText === "BOUGHT") action = "BUY";
  else if (sourceActionText === "SELL" || sourceActionText === "SOLD") action = "SELL";
  else if (
    sourceActionText === "FXT" ||
    sourceActionText === "CONVERSION" ||
    sourceActionText === "CONVERT FUNDS" ||
    sourceActionText === "FUNDS CONVERSION"
  ) {
    action = "FUNDS_CONVERSION";
  } else if (sourceActionText === "DIVIDEND" || hasTerm(combined, "DIVIDEND")) action = "DIVIDEND";
  else if (
    sourceActionText === "INTEREST" ||
    sourceActionText === "INTEREST EARNINGS" ||
    hasTerm(combined, "INTEREST")
  ) {
    action = "INTEREST";
  } else if (
    sourceActionText === "REFUND" ||
    hasAnyTerm(combined, ["REIMBURSEMENT", "REFUND"])
  ) {
    action = "REIMBURSEMENT";
  } else if (sourceActionText === "TAX" || sourceActionText === "HST" || hasTerm(combined, "TAX")) {
    action = "TAX";
  } else if (sourceActionText === "ADR" || hasAnyTerm(combined, ["FEE", "COMMISSION"])) action = "FEE";
  else if (hasTerm(combined, "PROMOTION")) action = "PROMOTION";
  else if (hasTerm(combined, "SPEND")) action = "SPEND";
  else if (hasTerm(combined, "CONTRIBUTION")) action = "CONTRIBUTION";
  else if (hasTerm(combined, "WITHDRAW") || hasTerm(combined, "WITHDRAWAL")) action = "WITHDRAWAL";
  else if (hasTerm(combined, "DEPOSIT")) action = "DEPOSIT";
  else if (
    hasTerm(combined, "TRANSFER") ||
    hasTerm(combined, "P2P") ||
    sourceActionText === "EXTERNAL ASSET TRANSFER OUT" ||
    sourceActionText === "EXTERNAL ASSET TRANSFER IN" ||
    sourceActionText === "INSTITUTIONAL TRANSFER"
  ) {
    action = "TRANSFER";
  } else if (
    sourceActionText === "CORPORATE ACTION" ||
    sourceActionText === "CIL" ||
    sourceActionText === "REV" ||
    sourceActionText === "MGR" ||
    sourceActionText === "BRW" ||
    sourceActionText === "SPLIT" ||
    sourceActionText === "SPINOFF"
  ) {
    action = "CORPORATE_ACTION";
  } else if (hasTerm(combined, "SELL") || hasTerm(combined, "SOLD")) action = "SELL";
  else if (hasTerm(combined, "BUY") || hasTerm(combined, "BOUGHT")) action = "BUY";
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
  } else if (
    ["DEPOSIT", "WITHDRAWAL", "CONTRIBUTION", "TRANSFER", "FEE", "FUNDS_CONVERSION"].includes(action)
  ) {
    assetType = "CASH";
  } else if (action === "DIVIDEND") {
    assetType = security ? "STOCK" : "DIVIDEND";
  }

  return { action, assetType };
}
