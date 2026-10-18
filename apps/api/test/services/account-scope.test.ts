import { assert, test } from "vitest";
import { isCashPageAccount, isInvestmentAccount } from "../../src/services/account_scope.js";

test("investment pages include every non-archived Investment account regardless of status", () => {
  const base = { isArchived: false };
  assert.equal(isInvestmentAccount({ ...base, type: "Investment" }), true);
  assert.equal(isInvestmentAccount({ ...base, type: "Investment", status: "inactive" }), true);
  assert.equal(isInvestmentAccount({ ...base, type: "Card" }), false);
  assert.equal(isInvestmentAccount({ ...base, type: null }), false);
  assert.equal(isInvestmentAccount({ ...base, type: "Investment", isArchived: true }), false);
});

test("cash scope accepts only non-archived Cash and Card account types", () => {
  assert.equal(isCashPageAccount({ type: "Cash", isArchived: false }), true);
  assert.equal(isCashPageAccount({ type: "Card", isArchived: false }), true);
  assert.equal(isCashPageAccount({ type: "Investment", isArchived: false }), false);
  assert.equal(isCashPageAccount({ type: "Expenses", isArchived: false }), false);
  assert.equal(isCashPageAccount({ type: null, isArchived: false }), false);
  assert.equal(isCashPageAccount({ type: "Cash", isArchived: true }), false);
});
