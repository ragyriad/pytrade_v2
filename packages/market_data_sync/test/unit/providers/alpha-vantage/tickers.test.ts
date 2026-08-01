import { assert, test } from "vitest";
import type { MarketDataSecurity } from "../../../../src/shared/provider-types.js";
import { getAlphaVantageTickerCandidates } from "../../../../src/providers/alpha-vantage/tickers.js";

function security(
  overrides: Partial<MarketDataSecurity>
): MarketDataSecurity {
  return {
    id: "a4a7096c-363d-4357-aa30-e5b8085a43f1",
    symbol: "AAPL",
    rawSymbol: "AAPL",
    currencyCode: "USD",
    exchangeCode: "NASDAQ",
    exchangeMicCode: "XNAS",
    exchangeName: "Nasdaq",
    ...overrides,
  };
}

test("TSX securities never match the unqualified US symbol", () => {
  assert.deepEqual(
    getAlphaVantageTickerCandidates(
      security({
        symbol: "CASH.TO",
        rawSymbol: "CASH",
        currencyCode: "CAD",
        exchangeCode: "TSX",
        exchangeMicCode: "XTSE",
        exchangeName: "Toronto Stock Exchange",
      })
    ),
    ["CASH.TRT"]
  );
});

test("TSX Venture securities use the Alpha Vantage TRV suffix", () => {
  assert.deepEqual(
    getAlphaVantageTickerCandidates(
      security({
        symbol: "ABC.V",
        rawSymbol: "ABC",
        currencyCode: "CAD",
        exchangeCode: "TSXV",
        exchangeMicCode: "XTSX",
        exchangeName: "TSX Venture",
      })
    ),
    ["ABC.TRV"]
  );
});

test("US securities retain their unqualified symbols", () => {
  assert.deepEqual(
    getAlphaVantageTickerCandidates(security({})),
    ["AAPL"]
  );
});
