import { NewAccount } from "../schemas/accounts_schema.js";
import type { Account as SnaptradeAccountSDK } from "snaptrade-typescript-sdk";
import {safeDate} from "../helpers_mapper.js";
type SnaptradeAccount = SnaptradeAccountSDK;

export function mapSnaptradeAccount(
  rawData: SnaptradeAccount,
  userId: string
): NewAccount {
  return {
    userId: userId,
    snaptradeAccountId: rawData.id ?? null,
    brokerageAuthorization: rawData.brokerage_authorization,
    brokerageAccountNumber: rawData.number ?? null,
    brokerageName: rawData.institution_name ?? null,
    //account info
    name: rawData.name,
    linkedAccountId: rawData.meta?.linked_account_id ?? null,
    type: rawData.meta?.type ?? null,
    status: rawData.meta?.status ?? "active",
    isPaper: rawData.is_paper ?? false,
    balanceCurrency: rawData.balance?.total?.currency ?? null,
    balanceAmount: rawData.balance?.total?.amount != null? 
      rawData.balance.total.amount.toString() : null,
    accountCurrency: rawData.meta?.currency?? null,
    // sync fields
    lastTransactionsSyncAt:
      safeDate(rawData.sync_status?.transactions?.last_successful_sync),
    firstTransactionDate: 
      safeDate(rawData.sync_status?.transactions?.first_transaction_date),
    lastHoldingsSyncAt:
      safeDate(rawData.sync_status?.holdings?.last_successful_sync),
  };
}