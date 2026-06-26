import { NewTransaction } from "../schemas/transactions_schema.js";
import type { UniversalActivity as SnaptradeTransactionSDK } from "snaptrade-typescript-sdk";
import {safeDate, safeNumeric} from "../helpers_mapper.js"

type SnaptradeTransaction = SnaptradeTransactionSDK;

export function mapSnaptradeTransaction(
  rawData: SnaptradeTransaction,
  accountId: string,
  securityId?: string | null
): NewTransaction {
  return {
    accountId,
    securityId: securityId ?? null,

    snaptradeTransactionId: rawData.id as string,

    type: rawData.type as NewTransaction["type"],
    description: rawData.description ?? null,

    amount: rawData.amount?.toString() ?? "0",
    price: safeNumeric(rawData.price),
    units: safeNumeric(rawData.units),
    fee: safeNumeric(rawData.fee) ?? "0",

    currencyCode: rawData.currency?.code ?? null,
    symbol: rawData.symbol?.symbol ?? null,

    tradeDate: safeDate(rawData.trade_date) ?? new Date(),
  };
}
