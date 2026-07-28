import assert from "node:assert/strict";
import test from "node:test";
import type { UniversalActivity } from "snaptrade-typescript-sdk";
import { mapSnaptradeTransaction } from "./transaction_mapper.js";

function activity(type: string): UniversalActivity {
  return {
    id: `activity-${type}`,
    type,
    description: `${type} activity`,
    amount: 5,
    units: 0,
    fee: 0,
    currency: { code: "CAD", name: "Canadian Dollar", id: "CAD" },
    symbol: {
      id: "pins-provider-id",
      symbol: "PINS",
      raw_symbol: "PINS",
      description: "Pinterest, Inc.",
    },
    trade_date: "2025-04-01",
  } as unknown as UniversalActivity;
}

test("cash account activity never retains a provider security", () => {
  const mapped = mapSnaptradeTransaction(
    activity("CREDIT_CARD"),
    "cash-account",
    "pins-security",
    {
      accountType: "CREDIT_CARD",
      underlyingSecurityId: "pins-security",
      optionId: "bad-option",
      optionAction: "BUY_TO_OPEN",
    }
  );

  assert.equal(mapped.securityId, null);
  assert.equal(mapped.underlyingSecurityId, null);
  assert.equal(mapped.optionId, null);
  assert.equal(mapped.optionAction, null);
  assert.equal(mapped.symbol, null);
  assert.equal(mapped.assetType, "CASH");
});

test("interest in an investment account does not attach to a security", () => {
  const mapped = mapSnaptradeTransaction(
    activity("INTEREST"),
    "tfsa-account",
    "pins-security",
    { accountType: "TFSA", underlyingSecurityId: "pins-security" }
  );

  assert.equal(mapped.action, "INTEREST");
  assert.equal(mapped.assetType, "INTEREST");
  assert.equal(mapped.securityId, null);
  assert.equal(mapped.underlyingSecurityId, null);
  assert.equal(mapped.symbol, null);
});

test("a security trade still keeps its security links", () => {
  const mapped = mapSnaptradeTransaction(
    activity("BUY"),
    "tfsa-account",
    "pins-security",
    { accountType: "TFSA", underlyingSecurityId: "pins-security" }
  );

  assert.equal(mapped.action, "BUY");
  assert.equal(mapped.securityId, "pins-security");
  assert.equal(mapped.underlyingSecurityId, "pins-security");
  assert.equal(mapped.symbol, "PINS");
});
