import { assert, test } from "vitest";
import type { TransactionDto } from "../../../app/lib/portfolioTypes";
import {
  buildOptionSecurityRows,
  getActiveOptionCount,
  isOptionTransaction,
} from "../../../app/services/options";

function transaction(
  overrides: Partial<TransactionDto> = {}
): TransactionDto {
  return {
    id: "transaction",
    accountId: "account",
    source: "SNAPTRADE",
    type: "BUY",
    action: "BUY",
    optionAction: null,
    assetType: "OPTION",
    description: "SHOP 2024-01-19 PUT 28",
    amount: { amount: -100, currency: "USD" },
    fee: { amount: 1, currency: "USD" },
    price: { amount: 1, currency: "USD" },
    units: 1,
    symbol: "SHOP",
    tradeDate: "2024-01-01T12:00:00.000Z",
    isArchived: false,
    ...overrides,
  };
}

test("excludes dividends and stock trades misclassified as OPTION", () => {
  assert.equal(
    isOptionTransaction(
      transaction({
        action: "DIVIDEND",
        type: "DIVIDEND",
        description: "Received a dividend from AAPL",
        symbol: "AAPL",
      })
    ),
    false
  );
  assert.equal(
    isOptionTransaction(
      transaction({
        description: "Bought 5.0000 of AMD at $88.14",
        symbol: "AMD",
      })
    ),
    false
  );
});

test("accepts blank provider optionAction when the transaction is a contract trade", () => {
  assert.equal(
    isOptionTransaction(
      transaction({
        optionId: "option-id",
        optionAction: "",
        action: "SELL",
        type: "SELL",
      })
    ),
    true
  );
});

test("expired compact-date contracts are never counted as open", () => {
  assert.equal(
    getActiveOptionCount([
      transaction({
        description: "CALL AMD 21JAN22 100",
        optionExpirationDate: "2022-01-21",
        units: 5,
      }),
    ]),
    0
  );
});

test("open positions net by account and canonical contract", () => {
  const futureDescription = "AMD 2099-01-19 CALL 100";
  assert.equal(
    getActiveOptionCount([
      transaction({
        id: "buy",
        description: futureDescription,
        optionExpirationDate: "2099-01-19",
        action: "BUY",
        units: 1,
      }),
      transaction({
        id: "sell",
        description: futureDescription,
        optionExpirationDate: "2099-01-19",
        action: "SELL",
        units: 1,
      }),
    ]),
    0
  );
  assert.equal(
    getActiveOptionCount([
      transaction({
        id: "account-a",
        accountId: "a",
        description: futureDescription,
        optionExpirationDate: "2099-01-19",
        action: "BUY",
        units: 1,
      }),
      transaction({
        id: "account-b",
        accountId: "b",
        description: futureDescription,
        optionExpirationDate: "2099-01-19",
        action: "SELL",
        units: 1,
      }),
    ]),
    2
  );
});

test("groups already-normalized option history without rewriting symbols", () => {
  const rows = buildOptionSecurityRows([
    transaction({
      id: "meta-old",
      symbol: "META",
      description: "FB 2022-01-21 CALL 300",
    }),
    transaction({
      id: "meta",
      symbol: "META",
      description: "META 2022-01-21 CALL 300",
    }),
  ]);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].symbol, "META");
  assert.equal(rows[0].transactionCount, 2);
});
