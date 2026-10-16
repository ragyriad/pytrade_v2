import { parseOptionContract } from "./options.js";
import { normalizeSecurityType } from "./securities.js";

export type SecurityLike = {
  symbol?: string | null;
  rawSymbol?: string | null;
  raw_symbol?: string | null;
  description?: string | null;
  instrumentTypeCode?: string | null;
  instrument_type_code?: string | null;
  instrumentTypeDescription?: string | null;
  instrument_type_description?: string | null;
};

export type TransactionLike = {
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
  return ["CASH", "CASH_USD", "CASH_CAD", "CREDIT_CARD"].includes(
    normalizeText(accountType)
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
  else if (sourceActionText === "CREDIT CARD") action = "SPEND";
  else if (sourceActionText === "CREDIT CARD PAYMENT") action = "CREDIT_CARD_PAYMENT";
  else if (sourceActionText === "P2P PAYMENT") action = "P2P_PAYMENT";
  else if (["FXT", "CONVERSION", "CONVERT FUNDS", "FUNDS CONVERSION", "FX CONVERSION"].includes(sourceActionText)) {
    action = "FUNDS_CONVERSION";
  } else if (sourceActionText === "DIVIDEND" || hasTerm(combined, "DIVIDEND")) action = "DIVIDEND";
  else if (sourceActionText === "INTEREST" || sourceActionText === "INTEREST EARNINGS" || hasTerm(combined, "INTEREST")) action = "INTEREST";
  else if (sourceActionText === "REFUND" || hasAnyTerm(combined, ["REIMBURSEMENT", "REFUND"])) action = "REIMBURSEMENT";
  else if (sourceActionText === "TAX" || sourceActionText === "HST" || hasTerm(combined, "TAX")) action = "TAX";
  else if (sourceActionText === "ADR" || hasAnyTerm(combined, ["FEE", "COMMISSION"])) action = "FEE";
  else if (hasTerm(combined, "PROMOTION")) action = "PROMOTION";
  else if (hasTerm(combined, "SPEND")) action = "SPEND";
  else if (
    [
      "EXTERNAL ASSET TRANSFER OUT",
      "EXTERNAL ASSET TRANSFER IN",
      "INSTITUTIONAL TRANSFER",
    ].includes(sourceActionText) ||
    hasTerm(combined, "INSTITUTIONAL TRANSFER")
  ) {
    action = "INSTITUTIONAL_TRANSFER";
  } else if (hasTerm(combined, "CONTRIBUTION")) {
    action = cashAccount ? "DEPOSIT" : "CONTRIBUTION";
  }
  else if (hasAnyTerm(combined, ["WITHDRAW", "WITHDRAWAL"])) action = "WITHDRAWAL";
  else if (hasTerm(combined, "DEPOSIT")) {
    action = cashAccount ? "DEPOSIT" : "CONTRIBUTION";
  }
  else if (
    hasTerm(combined, "TRANSFER") ||
    hasTerm(combined, "P2P")
  ) {
    action = "TRANSFER";
  } else if (
    ["CORPORATE ACTION", "CIL", "REV", "MGR", "BRW", "SPLIT", "SPINOFF"].includes(sourceActionText)
  ) {
    action = "CORPORATE_ACTION";
  } else if (hasAnyTerm(combined, ["SELL", "SOLD"])) action = "SELL";
  else if (hasAnyTerm(combined, ["BUY", "BOUGHT"])) action = "BUY";
  else if (units != null && units < 0) action = "SELL";
  else if (units != null && units > 0 && amount != null && amount < 0) action = "BUY";
  else if (sourceType === "OTHER") action = "OTHER";

  const instrumentCode = securityValue(security, "instrumentTypeCode", "instrument_type_code");
  const instrumentDescription = securityValue(
    security,
    "instrumentTypeDescription",
    "instrument_type_description"
  );
  const parsedOption = parseOptionContract(
    transaction.symbol,
    transaction.description,
    securityValue(security, "symbol", "symbol"),
    securityValue(security, "rawSymbol", "raw_symbol"),
    securityValue(security, "description", "description")
  );
  const normalizedSecurityType = normalizeSecurityType({
    code: instrumentCode,
    description: `${instrumentDescription} ${securityValue(security, "description", "description")} ${description}`,
    symbol: transaction.symbol,
  });

  let assetType = "OTHER";
  if (cashAccount) {
    assetType = "CASH";
    if (action === "CONTRIBUTION") action = "DEPOSIT";
  } else if (action === "INTEREST") assetType = "INTEREST";
  else if (action === "REIMBURSEMENT") assetType = "CASH";
  else if (parsedOption) assetType = "OPTION";
  else if (
    security &&
    (!normalizedSecurityType || normalizedSecurityType === "SECURITY") &&
    ["BUY", "SELL"].includes(action)
  ) {
    assetType = "STOCK";
  } else if (normalizedSecurityType) assetType = normalizedSecurityType;
  else if (["DEPOSIT", "WITHDRAWAL", "CONTRIBUTION", "TRANSFER", "INSTITUTIONAL_TRANSFER", "FEE", "FUNDS_CONVERSION"].includes(action)) assetType = "CASH";
  else if (action === "DIVIDEND") assetType = security ? "STOCK" : "DIVIDEND";

  return { action, assetType };
}
