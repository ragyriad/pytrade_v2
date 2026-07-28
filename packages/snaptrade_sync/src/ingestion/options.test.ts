import assert from "node:assert/strict";
import test from "node:test";
import { mapOptionFromActivity } from "./options.js";
import type { SnapTradeActivityLike } from "./securities.js";

test("stores an option contract ticker as rawSymbol and its underlying as symbol", () => {
  const mapped = mapOptionFromActivity({
    id: "option-activity",
    type: "BUY",
    option_type: "BUY_TO_OPEN",
    description: "PUT NVDA 04/21/23 125 NVIDIA CORPORATION",
    trade_date: "2023-04-01",
    currency: { code: "USD" },
    option_symbol: {
      id: "option-symbol",
      ticker: "NVDA230421P00125000",
      option_type: "PUT",
      strike_price: 125,
      expiration_date: "2023-04-21",
      underlying_symbol: {
        symbol: "NVDA",
        raw_symbol: "NVDA",
        description: "NVIDIA CORPORATION",
        currency: { code: "USD" },
      },
    },
  } as SnapTradeActivityLike);

  assert.ok(mapped);
  assert.equal(mapped.contractSecurity.symbol, "NVDA");
  assert.equal(mapped.contractSecurity.rawSymbol, "NVDA230421P00125000");
  assert.equal(mapped.option.ticker, "NVDA230421P00125000");
});
