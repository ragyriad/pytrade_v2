import type { Balance as SnaptradeBalance } from "snaptrade-typescript-sdk";
import type { NewAccountBalance } from "@repo/db";

function numericString(value: number | null | undefined): string | null {
  return value == null || !Number.isFinite(value) ? null : String(value);
}

export function mapSnaptradeBalance(
  rawBalance: SnaptradeBalance,
  accountId: string
): NewAccountBalance | null {
  const currencyCode = rawBalance.currency?.code?.trim().toUpperCase();
  if (!currencyCode) return null;

  return {
    accountId,
    currencyCode,
    cash: numericString(rawBalance.cash),
    buyingPower: numericString(rawBalance.buying_power),
    source: "SNAPTRADE",
    sourceFile: null,
    asOfDate: new Date().toISOString().slice(0, 10),
    syncedAt: new Date(),
  };
}
