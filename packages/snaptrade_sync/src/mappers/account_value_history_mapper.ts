import type { AccountValueHistoryResponse } from "snaptrade-typescript-sdk";
import type { NewAccountValueHistory } from "@repo/db";

function toDateOnly(value: string | undefined): string | null {
  if (!value) return null;

  // SnapTrade documents this field as a date, but its example payload uses
  // an ISO timestamp. Keep the provider's calendar day while accepting both.
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T)/.exec(value);
  if (!match) return null;

  const date = match[1];
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return null;
  }
  if (value !== date && Number.isNaN(Date.parse(value))) return null;

  return date;
}

export function mapSnaptradeAccountValueHistory(
  response: AccountValueHistoryResponse,
  accountId: string
): NewAccountValueHistory[] {
  const currencyCode = response.currency?.trim().toUpperCase();
  if (!currencyCode) return [];

  return (response.history ?? []).flatMap((item) => {
    const valueDate = toDateOnly(item.date);
    const totalValue = Number(item.total_value);
    if (!valueDate || !Number.isFinite(totalValue)) return [];

    return [{
      accountId,
      valueDate,
      totalValue: String(totalValue),
      currencyCode,
      source: "SNAPTRADE",
      syncedAt: new Date(),
    }];
  });
}
