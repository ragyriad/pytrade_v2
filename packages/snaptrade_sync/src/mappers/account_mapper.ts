import type { NewAccount } from "@repo/db";
import type { Account as SnaptradeAccountSDK } from "snaptrade-typescript-sdk";

function safeDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}
type SnaptradeAccount = SnaptradeAccountSDK;
type SnaptradeAccountMeta = NonNullable<SnaptradeAccount["meta"]> & {
  type?: string | null;
  status?: string | null;
  currency?: string | null;
  linked_account_id?: string | null;
  unifiedAccountType?: string | null;
};
type SnaptradeAccountWithRawFields = SnaptradeAccount & {
  raw_type?: string | null;
  opening_date?: string | Date | null;
  funding_date?: string | Date | null;
};

function normalizeAccountType(type: string | null | undefined): string | null {
  if (!type) return null;

  const normalized = type.trim().toUpperCase();
  if (normalized === "CASH" || normalized === "CASH_USD" || normalized === "CASH_CAD") {
    return "CASH";
  }
  if (normalized === "CA_CASH_MSB") return "CASH";

  return type;
}

function normalizeAccountStatus(status: string | null | undefined): NewAccount["status"] {
  const normalized = status?.trim().toLowerCase();
  switch (normalized) {
    case "active":
    case "inactive":
    case "deactivated":
    case "error":
    case "open":
    case "closed":
      return normalized;
    default:
      return "active";
  }
}

export function mapSnaptradeAccount(
  rawData: SnaptradeAccount,
  userId: string
): NewAccount {
  const meta = rawData.meta as SnaptradeAccountMeta | undefined;
  const rawAccount = rawData as SnaptradeAccountWithRawFields;

  return {
    userId: userId,
    snaptradeAccountId: rawData.id ?? null,
    brokerageAuthorization: rawData.brokerage_authorization,
    brokerageAccountNumber: rawData.number ?? null,
    brokerageName: rawData.institution_name ?? null,
    //account info
    name: rawData.name,
    linkedAccountId: meta?.linked_account_id ?? null,
    type: normalizeAccountType(meta?.unifiedAccountType ?? meta?.type),
    rawType: rawAccount.raw_type ?? null,
    snaptradeMetaType: meta?.type ?? null,
    snaptradeUnifiedAccountType: meta?.unifiedAccountType ?? null,
    status: normalizeAccountStatus(meta?.status),
    isPaper: rawData.is_paper ?? false,
    balanceCurrency: rawData.balance?.total?.currency ?? null,
    balanceAmount: rawData.balance?.total?.amount != null? 
      rawData.balance.total.amount.toString() : null,
    accountCurrency: meta?.currency?? null,
    rawData: rawData as unknown as Record<string, unknown>,
    // sync fields
    openingDate: safeDate(rawAccount.opening_date),
    fundingDate: safeDate(rawAccount.funding_date),
    lastTransactionsSyncAt:
      safeDate(rawData.sync_status?.transactions?.last_successful_sync),
    firstTransactionDate: 
      safeDate(rawData.sync_status?.transactions?.first_transaction_date),
    lastHoldingsSyncAt:
      safeDate(rawData.sync_status?.holdings?.last_successful_sync),
  };
}
