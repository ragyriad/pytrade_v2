import assert from "node:assert/strict";
import test from "node:test";
import type { Balance } from "snaptrade-typescript-sdk";
import { mapSnaptradeBalance } from "./mappers/account_balance_mapper.js";

test("maps a SnapTrade currency balance into an upsertable current snapshot", () => {
  const mapped = mapSnaptradeBalance(
    {
      currency: { code: "cad", name: "Canadian Dollar", id: "CAD" },
      cash: 1250.75,
      buying_power: 1500,
    } as Balance,
    "account-id"
  );

  assert.ok(mapped);
  assert.equal(mapped.accountId, "account-id");
  assert.equal(mapped.currencyCode, "CAD");
  assert.equal(mapped.cash, "1250.75");
  assert.equal(mapped.buyingPower, "1500");
  assert.equal(mapped.source, "SNAPTRADE");
});

test("rejects a balance with no currency identity", () => {
  assert.equal(
    mapSnaptradeBalance({ cash: 10 } as Balance, "account-id"),
    null
  );
});
