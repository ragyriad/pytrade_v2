import type { NewTransaction } from "@repo/db";
import { normalizeTransaction } from "@repo/data-normalizer";
import type { UniversalActivity as SnaptradeTransactionSDK } from "snaptrade-typescript-sdk";

type SnaptradeTransaction = SnaptradeTransactionSDK;

function safeNumeric(
  value: string | number | null | undefined
): string | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? String(parsed) : null;
}

function safeDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type MapSnaptradeTransactionOptions = {
  accountType?: string | null;
  underlyingSecurityId?: string | null;
  optionId?: string | null;
  optionAction?: string | null;
  symbolOverride?: string | null;
  descriptionOverride?: string | null;
  assetTypeOverride?: string | null;
};

function isCashPlaceholderSymbol(
  symbol: string | null | undefined,
  currencyCode: string | null | undefined,
  action: string
): boolean {
  if (action !== "INTEREST" && action !== "REIMBURSEMENT") return false;

  const normalizedSymbol = symbol?.trim().toUpperCase();
  if (!normalizedSymbol) return false;

  const normalizedCurrency = currencyCode?.trim().toUpperCase();
  return (
    normalizedSymbol === normalizedCurrency ||
    normalizedSymbol === "CAD.NE" ||
    normalizedSymbol === "USD"
  );
}

export function mapSnaptradeTransaction(
  rawData: SnaptradeTransaction,
  accountId: string,
  securityId?: string | null,
  options: MapSnaptradeTransactionOptions = {}
): NewTransaction {
  const normalized = normalizeTransaction(
    {
      type: rawData.type as string | null,
      description: rawData.description ?? null,
      symbol: rawData.symbol?.symbol ?? null,
      amount: rawData.amount?.toString() ?? "0",
      units: safeNumeric(rawData.units),
    },
    rawData.symbol
      ? {
          symbol: rawData.symbol.symbol ?? null,
          rawSymbol: rawData.symbol.raw_symbol ?? null,
          description: rawData.symbol.description ?? null,
          instrumentTypeCode: rawData.symbol.type?.code ?? null,
          instrumentTypeDescription: rawData.symbol.type?.description ?? null,
        }
      : null,
    { accountType: options.accountType }
  );
  const normalizedAccountType = options.accountType?.trim().toUpperCase();
  const isCashAccount =
    normalizedAccountType === "CASH" ||
    normalizedAccountType === "CASH_USD" ||
    normalizedAccountType === "CASH_CAD" ||
    normalizedAccountType === "CREDIT_CARD";
  const isCashTransaction =
    isCashAccount ||
    normalized.assetType === "CASH" ||
    normalized.assetType === "INTEREST";
  const symbol =
    isCashTransaction ||
    isCashPlaceholderSymbol(
      rawData.symbol?.symbol,
      rawData.currency?.code,
      normalized.action
    )
      ? null
      : options.symbolOverride ?? rawData.symbol?.symbol ?? null;
  const externalReferenceId =
    typeof (rawData as { external_reference_id?: unknown }).external_reference_id === "string"
      ? ((rawData as { external_reference_id?: string }).external_reference_id ?? null)
      : null;
  const amount =
    normalized.action === "TRANSFER"
      ? "0"
      : (rawData.amount?.toString() ?? "0");

  return {
    accountId,
    securityId: isCashTransaction || !symbol ? null : securityId ?? null,
    underlyingSecurityId:
      isCashTransaction || !symbol
        ? null
        : options.underlyingSecurityId ?? securityId ?? null,
    optionId: isCashTransaction ? null : options.optionId ?? null,

    snaptradeTransactionId: rawData.id as string,
    externalTransactionId: externalReferenceId,

    type: (isCashAccount ? "CASH" : rawData.type) as NewTransaction["type"],
    action: normalized.action,
    optionAction:
      isCashTransaction
        ? null
        : options.optionAction ??
          ((rawData as { option_type?: string | null }).option_type ?? null),
    assetType: isCashTransaction
      ? normalized.assetType
      : options.assetTypeOverride ?? normalized.assetType,
    description: options.descriptionOverride ?? rawData.description ?? null,

    amount,
    price: safeNumeric(rawData.price),
    units: safeNumeric(rawData.units),
    fee: safeNumeric(rawData.fee) ?? "0",

    currencyCode: rawData.currency?.code ?? null,
    symbol,

    tradeDate: safeDate(rawData.trade_date) ?? new Date(),
    rawData: rawData as Record<string, unknown>,
  };
}
