import type { AccountValueHistoryResponse } from "snaptrade-typescript-sdk";
import type { NewAccountValueHistory } from "@repo/db";

function isDateOnly(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export function mapSnaptradeAccountValueHistory(
  response: AccountValueHistoryResponse,
  accountId: string
): NewAccountValueHistory[] {
  const currencyCode = response.currency?.trim().toUpperCase();
  if (!currencyCode) return [];

  return (response.history ?? []).flatMap((item) => {
    const totalValue = Number(item.total_value);
    if (!isDateOnly(item.date) || !Number.isFinite(totalValue)) return [];

    return [{
      accountId,
      valueDate: item.date,
      totalValue: String(totalValue),
      currencyCode,
      source: "SNAPTRADE",
      syncedAt: new Date(),
    }];
  });
}
