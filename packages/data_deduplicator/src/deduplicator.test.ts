import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateSnaptradeCashActivities,
  planExactProviderDuplicateArchives,
  planSecurityDuplicates,
  planStoredTransactionDuplicates,
  transactionEconomicKey,
} from "./index.ts";

test("economic identity ignores symbol aliases, type, and unit sign", () => {
  assert.equal(
    transactionEconomicKey({
      accountId: "account",
      tradeDate: "2020-01-29",
      symbol: "SNE",
      amount: "-906",
      units: "15",
      currencyCode: "USD",
    }),
    transactionEconomicKey({
      accountId: "account",
      tradeDate: "2020-01-29T05:00:00Z",
      symbol: "SONY",
      amount: "-906.00",
      units: "-15",
      currencyCode: "usd",
    })
  );
});

test("security duplicate planning keeps the established deterministic scoring", () => {
  const [plan] = planSecurityDuplicates([
    {
      id: "legacy",
      canonicalSymbol: "SONY",
      storedSymbol: "SNE",
      canonicalType: "STOCK",
      isSynthetic: true,
      hasProviderId: false,
      hasFigi: false,
      hasExchange: false,
      transactionCount: 5,
      aliasCount: 0,
    },
    {
      id: "snap",
      canonicalSymbol: "SONY",
      storedSymbol: "SONY",
      canonicalType: "STOCK",
      isSynthetic: false,
      hasProviderId: true,
      hasFigi: true,
      hasExchange: true,
      transactionCount: 1,
      aliasCount: 1,
    },
  ]);
  assert.equal(plan.keeperId, "snap");
  assert.deepEqual(plan.duplicateIds, ["legacy"]);
});

test("deduplicates exact fetched activities but preserves reversals", () => {
  const common = {
    trade_date: "2025-01-01",
    type: "CREDIT CARD",
    description: "PURCHASE",
    currency: { code: "CAD" },
  };
  const result = deduplicateSnaptradeCashActivities([
    { ...common, id: "b", amount: -25 },
    { ...common, id: "a", amount: -25 },
    { ...common, id: "c", amount: 25 },
  ]);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.activities.map((row) => row.id).sort(), ["a", "c"]);
});

test("stored duplicate planning preserves positive and negative reversals", () => {
  const duplicateIds = planExactProviderDuplicateArchives([
    { id: "a", accountId: "account", source: "SNAPTRADE", tradeDate: "2025-01-01", amount: -25, units: 0 },
    { id: "b", accountId: "account", source: "SNAPTRADE", tradeDate: "2025-01-01", amount: -25, units: 0 },
    { id: "c", accountId: "account", source: "SNAPTRADE", tradeDate: "2025-01-01", amount: 25, units: 0 },
  ]);
  assert.deepEqual(duplicateIds, ["b"]);
});

test("provider duplicate planning never crosses account boundaries", () => {
  const duplicateIds = planExactProviderDuplicateArchives([
    { id: "a", accountId: "first", source: "SNAPTRADE", tradeDate: "2025-01-01", amount: -25 },
    { id: "b", accountId: "second", source: "SNAPTRADE", tradeDate: "2025-01-01", amount: -25 },
  ]);
  assert.deepEqual(duplicateIds, []);
});

test("economic identity extracts an option underlying from its description", () => {
  assert.equal(
    transactionEconomicKey({
      accountId: "account",
      tradeDate: "2022-04-14",
      symbol: "CNQ14APR22C55",
      description: "CNQ 2022-04-14 CALL 55",
      amount: -100,
      units: 1,
      currencyCode: "CAD",
    }),
    transactionEconomicKey({
      accountId: "account",
      tradeDate: "2022-04-14",
      symbol: "CNQ",
      amount: -100,
      units: 1,
      currencyCode: "CAD",
    })
  );
});

test("economic identity applies source-scoped legacy corrections", () => {
  assert.equal(
    transactionEconomicKey({
      accountId: "account",
      tradeDate: "2020-01-01",
      symbol: "V005059",
      source: "Questrade Legacy",
      amount: -100,
      units: 2,
      currencyCode: "USD",
    }),
    transactionEconomicKey({
      accountId: "account",
      tradeDate: "2020-01-01",
      symbol: "VALE",
      source: "SNAPTRADE",
      amount: -100,
      units: 2,
      currencyCode: "USD",
    })
  );
});

test("cross-source matching keeps the preferred source only after an economic match", () => {
  const decisions = planStoredTransactionDuplicates([
    {
      id: "snap",
      accountId: "account",
      source: "SNAPTRADE",
      tradeDate: "2020-01-29",
      amount: -906,
      units: 15,
      currencyCode: "USD",
      symbol: "SONY",
    },
    {
      id: "statement",
      accountId: "account",
      source: "questrade_statements",
      tradeDate: "2020-01-29",
      amount: -906,
      units: -15,
      currencyCode: "USD",
      symbol: "SNE",
    },
  ]);
  assert.equal(decisions[0]?.keeperId, "snap");
  assert.equal(decisions[0]?.duplicateId, "statement");
  assert.equal(decisions[0]?.confidence, "EXACT_CROSS_SOURCE");
});
