import assert from "node:assert/strict";
import test from "node:test";
import type { TransactionDto } from "../lib/portfolio-types";
import {
  buildMonthlyCostRows,
  filterCostTransactions,
  getFeeTotals,
  getTaxTotals,
  isFeeTransaction,
  isTaxTransaction,
} from "./costs";

function transaction(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: "transaction",
    accountId: "account",
    source: "QUESTRADE_STATEMENTS",
    type: "BUY",
    action: "BUY",
    assetType: "EQUITY",
    description: "Bought a security",
    amount: { amount: -100, currency: "CAD" },
    fee: { amount: -4.95, currency: "CAD" },
    price: { amount: 100, currency: "CAD" },
    units: 1,
    symbol: "TEST",
    tradeDate: "2026-01-15T12:00:00.000Z",
    isArchived: false,
    ...overrides,
  };
}

test("recognizes normalized and descriptive withholding taxes", () => {
  assert.equal(
    isTaxTransaction(
      transaction({
        action: "TAX",
        type: "WITHHOLDING_TAX",
        fee: { amount: 0, currency: "USD" },
      })
    ),
    true
  );
  assert.equal(
    isTaxTransaction(
      transaction({
        action: "OTHER",
        type: "OTHER",
        description: "US non-resident tax withheld",
        fee: { amount: 0, currency: "USD" },
      })
    ),
    true
  );
});

test("does not double-count HST as a fee when the dedicated fee value is zero", () => {
  const hst = transaction({
    action: "TAX",
    type: "FEE",
    description: "Harmonized sales tax",
    amount: { amount: -1.25, currency: "CAD" },
    fee: { amount: 0, currency: "CAD" },
  });

  assert.equal(isTaxTransaction(hst), true);
  assert.equal(isFeeTransaction(hst), false);
});

test("includes embedded trade commissions and standalone fee transactions", () => {
  const commission = transaction();
  const standalone = transaction({
    id: "standalone",
    action: "FEE",
    type: "FEE",
    amount: { amount: -9.95, currency: "CAD" },
    fee: { amount: 0, currency: "CAD" },
  });

  const totals = getFeeTotals([commission, standalone]);
  assert.equal(isFeeTransaction(commission), true);
  assert.equal(totals[0].currency, "CAD");
  assert.ok(Math.abs(totals[0].amount - 14.9) < 0.000001);
});

test("does not classify a zero-fee trade from tax or fee words in its description", () => {
  const trade = transaction({
    description: "Tax efficient ETF purchase with commission",
    fee: { amount: 0, currency: "CAD" },
  });

  assert.equal(isTaxTransaction(trade), false);
  assert.equal(isFeeTransaction(trade), false);
});

test("filters a combined cost list without duplicating transactions", () => {
  const fee = transaction({
    id: "fee",
    action: "FEE",
    type: "FEE",
    amount: { amount: -9.95, currency: "CAD" },
    fee: { amount: 0, currency: "CAD" },
  });
  const tax = transaction({
    id: "tax",
    action: "TAX",
    type: "WITHHOLDING_TAX",
    amount: { amount: -15, currency: "USD" },
    fee: { amount: 0, currency: "USD" },
  });

  assert.deepEqual(filterCostTransactions([fee, tax], "both").map(({ id }) => id), [
    "fee",
    "tax",
  ]);
  assert.deepEqual(getTaxTotals([fee, tax]), [{ amount: 15, currency: "USD" }]);
});

test("excludes dividends from the costs view even when they include a fee", () => {
  const dividend = transaction({
    id: "dividend",
    action: "DIVIDEND",
    type: "DIVIDEND",
  });

  const fee = transaction({ id: "fee", action: "FEE", type: "FEE" });
  assert.deepEqual(filterCostTransactions([fee, dividend], "both").map(({ id }) => id), [
    "fee",
  ]);
});

test("builds separate fee and tax chart series by currency", () => {
  const costs = [
    transaction({
      id: "fee",
      action: "FEE",
      type: "FEE",
      amount: { amount: -4.95, currency: "CAD" },
      fee: { amount: 0, currency: "CAD" },
    }),
    transaction({
      id: "tax",
      action: "TAX",
      type: "WITHHOLDING_TAX",
      amount: { amount: -8, currency: "USD" },
      fee: { amount: 0, currency: "USD" },
    }),
  ];

  const result = buildMonthlyCostRows(costs);
  assert.deepEqual(
    result.series.map(({ key }) => key),
    ["fee_CAD", "tax_USD"]
  );
  assert.equal(result.rows[0]["fee_CAD"], 4.95);
  assert.equal(result.rows[0]["tax_USD"], 8);
});
