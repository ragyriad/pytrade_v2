import { describe, expect, test } from "vitest";
import { mapSnaptradeAccountValueHistory } from "../../../src/mappers/account_value_history_mapper.js";

describe("mapSnaptradeAccountValueHistory", () => {
  test("maps valid SnapTrade history and skips malformed values", () => {
    const rows = mapSnaptradeAccountValueHistory({
      currency: "cad",
      history: [
        { date: "2026-08-01", total_value: "1234.56" },
        { date: "2026-08-02T00:00:00.000Z", total_value: "1250.00" },
        { date: "not-a-date", total_value: "12" },
        { date: "2026-02-30T00:00:00.000Z", total_value: "12" },
        { date: "2026-08-03Tinvalid", total_value: "12" },
        { date: "2026-08-02", total_value: "not-a-number" },
      ],
    }, "account-id");

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      accountId: "account-id",
      valueDate: "2026-08-01",
      totalValue: "1234.56",
      currencyCode: "CAD",
      source: "SNAPTRADE",
    });
    expect(rows[1]).toMatchObject({
      accountId: "account-id",
      valueDate: "2026-08-02",
      totalValue: "1250",
      currencyCode: "CAD",
      source: "SNAPTRADE",
    });
  });
});
