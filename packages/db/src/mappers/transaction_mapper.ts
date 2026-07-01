import { NewTransaction } from "../schemas/transactions_schema.js";
import type { UniversalActivity as SnaptradeTransactionSDK } from "snaptrade-typescript-sdk";
import {safeDate, safeNumeric} from "../helpers_mapper.js"
import { normalizeTransaction } from "../transaction_normalization.js";

type SnaptradeTransaction = SnaptradeTransactionSDK;

export type MapSnaptradeTransactionOptions = {
  accountType?: string | null;
  underlyingSecurityId?: string | null;
  optionId?: string | null;
  optionAction?: string | null;
  symbolOverride?: string | null;
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
  const symbol = isCashPlaceholderSymbol(
    rawData.symbol?.symbol,
    rawData.currency?.code,
    normalized.action
  )
    ? null
    : options.symbolOverride ?? rawData.symbol?.symbol ?? null;
  const normalizedAccountType = options.accountType?.trim().toUpperCase();
  const isCashAccount =
    normalizedAccountType === "CASH" ||
    normalizedAccountType === "CASH_USD" ||
    normalizedAccountType === "CASH_CAD";
  const externalReferenceId =
    typeof (rawData as { external_reference_id?: unknown }).external_reference_id === "string"
      ? ((rawData as { external_reference_id?: string }).external_reference_id ?? null)
      : null;

  return {
    accountId,
    securityId: symbol ? securityId ?? null : null,
    underlyingSecurityId: symbol ? options.underlyingSecurityId ?? securityId ?? null : null,
    optionId: options.optionId ?? null,

    snaptradeTransactionId: rawData.id as string,
    externalTransactionId: externalReferenceId,

    type: (isCashAccount ? "CASH" : rawData.type) as NewTransaction["type"],
    action: normalized.action,
    optionAction:
      options.optionAction ??
      ((rawData as { option_type?: string | null }).option_type ?? null),
    assetType: options.assetTypeOverride ?? normalized.assetType,
    description: rawData.description ?? null,

    amount: rawData.amount?.toString() ?? "0",
    price: safeNumeric(rawData.price),
    units: safeNumeric(rawData.units),
    fee: safeNumeric(rawData.fee) ?? "0",

    currencyCode: rawData.currency?.code ?? null,
    symbol,

    tradeDate: safeDate(rawData.trade_date) ?? new Date(),
    rawData: rawData as Record<string, unknown>,
  };
}
