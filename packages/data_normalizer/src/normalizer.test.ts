import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeSymbol,
  normalizeSecurityIdentity,
  normalizeSecurityProfile,
  normalizeSecurityType,
  normalizeTransaction,
  optionUnderlyingDescription,
  parseOptionContract,
  resolveSecurityCandidate,
} from "./index.ts";

test("canonicalizes renamed symbols", () => {
  assert.equal(canonicalizeSymbol("SNE"), "SONY");
  assert.equal(canonicalizeSymbol(".sq"), "XYZ");
  assert.equal(canonicalizeSymbol("fb"), "META");
  assert.equal(canonicalizeSymbol("V005059"), "V005059");
  assert.equal(
    canonicalizeSymbol("V005059", { source: "Questrade Legacy" }),
    "VALE"
  );
});

test("parses a clear Questrade option description", () => {
  assert.deepEqual(parseOptionContract("(CNQ 2022-04-14 CALL 55)"), {
    underlyingSymbol: "CNQ",
    rawUnderlyingSymbol: "CNQ",
    expirationDate: "2022-04-14",
    contractType: "CALL",
    strikePrice: "55.000000",
    ticker: "CNQ220414C00055000",
  });
});

test("uses the readable description when the provider symbol is malformed", () => {
  const parsed = parseOptionContract(
    "(CNQ 2022-04-14 CALL 55)",
    "CNQ14APR22C55000"
  );
  assert.equal(parsed?.underlyingSymbol, "CNQ");
  assert.equal(parsed?.expirationDate, "2022-04-14");
  assert.equal(parsed?.strikePrice, "55.000000");
});

test("keeps an option contract in rawSymbol while displaying the underlying symbol", () => {
  const identity = normalizeSecurityIdentity({
    securityKey: "option:NVDA230421P00125000",
    symbol: "NVDA230421P00125000",
    rawSymbol: "PUT NVDA 04/21/23 125",
    description: "PUT NVDA 04/21/23 125 NVIDIA CORPORATION",
  });

  assert.equal(identity.symbol, "NVDA");
  assert.equal(identity.rawSymbol, "PUT NVDA 04/21/23 125");
  assert.equal(identity.optionContract?.ticker, "NVDA230421P00125000");
});

test("classifies statement holdings more specifically than SECURITY", () => {
  assert.equal(normalizeSecurityType({ category: "ETF" }), "ETF");
  assert.equal(
    normalizeSecurityType({ description: "Sony sponsored American Depositary Receipt" }),
    "ADR"
  );
});

test("does not model an option contract as a security instrument type", () => {
  assert.equal(normalizeSecurityType({ category: "OPTION" }), null);
  assert.equal(normalizeSecurityType({ code: "OPT" }), null);
});

test("resolves historical Canadian DOC as delisted CloudMD", () => {
  assert.deepEqual(
    normalizeSecurityProfile({
      symbol: "DOC",
      currencyCode: "CAD",
      description: "DOC Healthpeak Properties",
      observedAt: "2023-04-01",
    }),
    {
      symbol: "DOC",
      description: "CloudMD Software & Services Inc.",
      currencyCode: "CAD",
      exchangeCode: "TSXV",
      exchangeMicCode: "XTSX",
      exchangeName: "TSX Venture Exchange",
      listingStatus: "DELISTED",
      delistedAt: "2024-07-10",
    }
  );
  assert.equal(
    normalizeSecurityProfile({
      symbol: "DOC",
      currencyCode: "USD",
      description: "Healthpeak Properties",
      observedAt: "2023-04-01",
    }),
    null
  );
  assert.equal(
    normalizeSecurityProfile({
      symbol: "DOC",
      currencyCode: "USD",
      description: "CLOUDMD SOFTWARE & SERVICES INC WE ACTED AS AGENT",
      observedAt: "2021-04-20",
    })?.description,
    "CloudMD Software & Services Inc."
  );
});

test("parses Questrade's side-first option description", () => {
  assert.deepEqual(parseOptionContract("PUT NVDA 04/21/23 125"), {
    underlyingSymbol: "NVDA",
    rawUnderlyingSymbol: "NVDA",
    expirationDate: "2023-04-21",
    contractType: "PUT",
    strikePrice: "125.000000",
    ticker: "NVDA230421P00125000",
  });
});

test("retains a company name after removing option contract details", () => {
  assert.equal(
    optionUnderlyingDescription(
      "PUT NVDA 04/21/23 125 NVIDIA CORPORATION"
    ),
    "NVIDIA CORPORATION"
  );
  assert.equal(
    optionUnderlyingDescription("CNQ 2022-04-14 CALL 55"),
    null
  );
});

test("treats buy and sell activity with an untyped security as stock", () => {
  assert.deepEqual(
    normalizeTransaction(
      {
        type: "BUY",
        description: "NVIDIA CORPORATION",
        symbol: "NVDA",
      },
      {
        symbol: "NVDA",
        description: "NVIDIA CORPORATION",
        instrumentTypeCode: null,
      }
    ),
    { action: "BUY", assetType: "STOCK" }
  );
});

test("resolves a symbol-less activity using an existing company description", () => {
  const match = resolveSecurityCandidate(
    {
      description: "VERIZON COMMUNICATIONS WE ACTED AS AGENT",
      currencyCode: "USD",
      rawData: { symbol: null },
    },
    [
      {
        id: "vz",
        source: "questrade_statements",
        symbol: "VZ",
        description: "VERIZON COMMUNICATIONS WE ACTED AS AGENT",
        currencyCode: "USD",
      },
    ]
  );
  assert.equal(match?.id, "vz");
});
