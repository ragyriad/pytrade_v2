import { assert, test } from "vitest";
import { planSnaptradeCreditCardPaymentActions } from "../../../src/ingestion/cash_reconciliation.js";

const accounts = [
  {
    id: "cash",
    brokerageName: "Wealthsimple Trade",
    type: "CASH",
    rawType: null,
    snaptradeMetaType: "CA_CASH_MSB",
    snaptradeUnifiedAccountType: "CASH",
    name: "Wealthsimple Debit Card",
  },
  {
    id: "card",
    brokerageName: "Wealthsimple Trade",
    type: "CREDIT_CARD",
    rawType: null,
    snaptradeMetaType: "CREDIT_CARD",
    snaptradeUnifiedAccountType: "CREDIT_CARD",
    name: "Wealthsimple Credit Card",
  },
];

function transaction(
  id: string,
  accountId: string,
  amount: string,
  overrides: Partial<{
    action: string;
    tradeDate: Date;
    currencyCode: string;
  }> = {}
) {
  return {
    id,
    accountId,
    action: overrides.action ?? "SPEND",
    type: "CASH",
    amount,
    currencyCode: overrides.currencyCode ?? "CAD",
    tradeDate:
      overrides.tradeDate ?? new Date("2026-07-01T12:00:00.000Z"),
  };
}

test("matches an exact Wealthsimple cash-to-card payment pair", () => {
  const plan = planSnaptradeCreditCardPaymentActions(accounts, [
    transaction("cash-payment", "cash", "-217.77"),
    transaction("card-receipt", "card", "217.77"),
  ]);

  assert.deepEqual(plan, {
    sentTransactionIds: ["cash-payment"],
    receivedTransactionIds: ["card-receipt"],
  });
});

test("matches SnapTrade's sub-second timestamp difference", () => {
  const plan = planSnaptradeCreditCardPaymentActions(accounts, [
    transaction("cash-payment", "cash", "217.77", {
      action: "CREDIT_CARD_PAYMENT",
      tradeDate: new Date("2026-07-01T12:00:00.492Z"),
    }),
    transaction("card-receipt", "card", "217.77", {
      tradeDate: new Date("2026-07-01T12:00:01.000Z"),
    }),
  ]);

  assert.deepEqual(plan, {
    sentTransactionIds: ["cash-payment"],
    receivedTransactionIds: ["card-receipt"],
  });
});

test("does not match different timestamps, amounts, currencies, or signs", () => {
  const plan = planSnaptradeCreditCardPaymentActions(accounts, [
    transaction("cash-payment", "cash", "-217.77"),
    transaction("wrong-date", "card", "217.77", {
      tradeDate: new Date("2026-07-01T12:00:01.000Z"),
    }),
    transaction("wrong-amount", "card", "217.78"),
    transaction("wrong-currency", "card", "217.77", {
      currencyCode: "USD",
    }),
    transaction("wrong-sign", "card", "-217.77"),
  ]);

  assert.deepEqual(plan, {
    sentTransactionIds: [],
    receivedTransactionIds: [],
  });
});
