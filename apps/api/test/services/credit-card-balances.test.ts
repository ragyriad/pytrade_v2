import { assert, test } from "vitest";
import {
  calculateCreditCardBalances,
  type CreditCardBalanceAccountInput,
  type CreditCardBalanceTransactionInput,
} from "../../src/services/credit-card-balances.js";

const cashAccount: CreditCardBalanceAccountInput = {
  id: "cash",
  institutionName: "Wealthsimple",
  accountCurrency: "CAD",
  status: "open",
  category: "cash",
  balances: [{ amount: 100, currency: "CAD" }],
};

const cardAccount: CreditCardBalanceAccountInput = {
  id: "card",
  institutionName: "Wealthsimple",
  accountCurrency: "CAD",
  status: "open",
  category: "credit",
  balances: [{ amount: 0, currency: "CAD" }],
  creditLimit: { amount: 10_000, currency: "CAD" },
};

function transaction(
  input: Omit<
    Partial<CreditCardBalanceTransactionInput>,
    "id" | "accountId" | "action" | "amount"
  > & {
    id: string;
    accountId: string;
    action: string;
    amount: number;
  }
): CreditCardBalanceTransactionInput {
  return {
    type: "CASH",
    tradeDate: "2026-07-01T12:00:00.000Z",
    isArchived: false,
    ...input,
    amount: { amount: input.amount, currency: "CAD" },
  };
}

test("calculates charges, reversals, and cash-account payments", () => {
  const result = calculateCreditCardBalances(
    [cashAccount, cardAccount],
    [
      transaction({
        id: "charge",
        accountId: "card",
        action: "SPEND",
        amount: 200,
      }),
      transaction({
        id: "reversal",
        accountId: "card",
        action: "REVERSAL",
        amount: -25,
      }),
      transaction({
        id: "payment",
        accountId: "cash",
        action: "CREDIT_CARD_PAYMENT",
        amount: 100,
      }),
    ]
  );

  assert.deepEqual(result.unallocatedPayments, []);
  assert.deepEqual(
    {
      netAmount: result.balances[0].netAmount,
      amountOwing: result.balances[0].amountOwing,
      creditAmount: result.balances[0].creditAmount,
      creditLimit: result.balances[0].creditLimit,
      charges: result.balances[0].charges,
      returns: result.balances[0].returns,
      payments: result.balances[0].payments,
      status: result.balances[0].status,
    },
    {
      netAmount: -75,
      amountOwing: 75,
      creditAmount: 0,
      creditLimit: 10_000,
      charges: 200,
      returns: 25,
      payments: 100,
      status: "owing",
    }
  );
});

test("reports an overpaid or returned balance as positive available credit", () => {
  const result = calculateCreditCardBalances(
    [cashAccount, cardAccount],
    [
      transaction({
        id: "charge",
        accountId: "card",
        action: "SPEND",
        amount: 40,
      }),
      transaction({
        id: "return",
        accountId: "card",
        action: "REIMBURSEMENT",
        amount: 15,
      }),
      transaction({
        id: "payment",
        accountId: "cash",
        action: "CREDIT_CARD_PAYMENT",
        amount: 50,
      }),
    ]
  );

  assert.equal(result.balances[0].netAmount, 25);
  assert.equal(result.balances[0].amountOwing, 0);
  assert.equal(result.balances[0].creditAmount, 25);
  assert.equal(result.balances[0].status, "credit");
});

test("does not guess when a payment could belong to multiple cards", () => {
  const secondCard = {
    ...cardAccount,
    id: "card-2",
  };
  const result = calculateCreditCardBalances(
    [cashAccount, cardAccount, secondCard],
    [
      transaction({
        id: "payment",
        accountId: "cash",
        action: "CREDIT_CARD_PAYMENT",
        amount: 50,
      }),
    ]
  );

  assert.deepEqual(result.unallocatedPayments, [
    { amount: 50, currency: "CAD" },
  ]);
  assert.ok(result.balances.every((balance) => balance.payments === 0));
});

test("infers a same-brokerage payment pair without double-counting it", () => {
  const result = calculateCreditCardBalances(
    [cashAccount, cardAccount],
    [
      transaction({
        id: "charge",
        accountId: "card",
        action: "SPEND",
        amount: 235.68,
      }),
      transaction({
        id: "cash-side",
        accountId: "cash",
        action: "SPEND",
        amount: -217.77,
      }),
      transaction({
        id: "card-side",
        accountId: "card",
        action: "SPEND",
        amount: 217.77,
      }),
    ]
  );

  assert.equal(result.balances[0].charges, 235.68);
  assert.equal(result.balances[0].payments, 217.77);
  assert.equal(result.balances[0].netAmount, -17.91);
  assert.equal(result.balances[0].amountOwing, 17.91);
});
