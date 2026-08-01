import { assert, test } from "vitest";
import type { PositionDto } from "../../../app/lib/portfolioTypes";
import {
  buildPositionAllocationSlices,
  getAggregateUnrealizedPercent,
  getTotalMarketValue,
  getUnrealizedReturnPercent,
} from "../../../app/services/portfolio";

function position(overrides: Partial<PositionDto> = {}): PositionDto {
  return {
    id: "position",
    accountId: "account",
    securityId: "security",
    symbol: "TEST",
    description: "Test security",
    units: 1,
    price: { amount: 100, currency: "CAD" },
    marketValue: { amount: 100, currency: "CAD" },
    averagePurchasePrice: { amount: 80, currency: "CAD" },
    unrealizedGainLoss: { amount: 20, currency: "CAD" },
    assetType: "STOCK",
    isCashEquivalent: false,
    ...overrides,
  };
}

test("groups market values by currency without combining currencies", () => {
  assert.deepEqual(
    getTotalMarketValue([
      position({ marketValue: { amount: 120, currency: "CAD" } }),
      position({ id: "usd", marketValue: { amount: 50, currency: "USD" } }),
      position({ id: "cad", marketValue: { amount: 30, currency: "CAD" } }),
    ]),
    [
      { amount: 150, currency: "CAD" },
      { amount: 50, currency: "USD" },
    ]
  );
});

test("calculates unrealized returns from market value and gain/loss", () => {
  assert.equal(getUnrealizedReturnPercent(position()), 25);
  assert.equal(
    getUnrealizedReturnPercent(
      position({ marketValue: { amount: 20, currency: "CAD" }, unrealizedGainLoss: { amount: 20, currency: "CAD" } })
    ),
    null
  );
});

test("combines allocation slices by symbol and returns a stable descending order", () => {
  assert.deepEqual(
    buildPositionAllocationSlices([
      position({ symbol: "AAPL", marketValue: { amount: 100, currency: "USD" } }),
      position({ id: "aapl-2", symbol: "AAPL", marketValue: { amount: 50, currency: "USD" } }),
      position({ id: "msft", symbol: "MSFT", marketValue: { amount: 50, currency: "USD" } }),
    ]),
    [
      { label: "AAPL", value: 150, currency: "USD", percentage: 75 },
      { label: "MSFT", value: 50, currency: "USD", percentage: 25 },
    ]
  );
});

test("returns null when aggregate cost basis is zero", () => {
  assert.equal(
    getAggregateUnrealizedPercent([
      position({ marketValue: { amount: 20, currency: "CAD" }, unrealizedGainLoss: { amount: 20, currency: "CAD" } }),
    ]),
    null
  );
});
