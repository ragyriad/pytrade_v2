import { assert, test } from "vitest";
import { isCashPageAccount, isInvestmentAccount, isOpenAccount } from "../../src/services/account_scope.js";

test("investment pages include every non-archived Investment account regardless of status", () => {
  const base = { isArchived: false };
  assert.equal(isInvestmentAccount({ ...base, type: "Investment" }), true);
  assert.equal(isInvestmentAccount({ ...base, type: "Investment", status: "inactive" }), true);
  assert.equal(isInvestmentAccount({ ...base, type: "Card" }), false);
  assert.equal(isInvestmentAccount({ ...base, type: null }), false);
  assert.equal(isInvestmentAccount({ ...base, type: "Investment", isArchived: true }), false);
});

test("portfolio account scope treats active and open accounts as open", () => {
  const base = { isArchived: false, type: "Investment" };
  assert.equal(isOpenAccount({ ...base, status: "active" }), true);
  assert.equal(isOpenAccount({ ...base, status: "open" }), true);
  assert.equal(isOpenAccount({ ...base, status: "CLOSED" }), false);
  assert.equal(isOpenAccount({ ...base, status: "inactive" }), false);
  assert.equal(isOpenAccount({ ...base, status: "error" }), false);
  assert.equal(isOpenAccount({ ...base, status: null }), true);
});

test("cash scope accepts only non-archived Cash and Card account types", () => {
  assert.equal(isCashPageAccount({ type: "Cash", isArchived: false }), true);
  assert.equal(isCashPageAccount({ type: "Card", isArchived: false }), true);
  assert.equal(isCashPageAccount({ type: "Investment", isArchived: false }), false);
  assert.equal(isCashPageAccount({ type: "Expenses", isArchived: false }), false);
  assert.equal(isCashPageAccount({ type: null, isArchived: false }), false);
  assert.equal(isCashPageAccount({ type: "Cash", isArchived: true }), false);
});
