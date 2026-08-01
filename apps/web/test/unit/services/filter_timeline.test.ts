import { assert, test } from "vitest";
import {
  annualizationFactor,
  filterTransactionsByTimeline,
  getMonthDivisor,
  getTimelineStart,
} from "../../../app/services/filter_timeline";

const transactions = [
  { id: "old", tradeDate: "2025-01-15T12:00:00.000Z" },
  { id: "recent", tradeDate: "2025-04-15T12:00:00.000Z" },
];

test("uses the latest transaction as the relative timeline anchor", () => {
  assert.equal(getTimelineStart(transactions, "3M")?.toISOString(), "2025-01-15T12:00:00.000Z");
  assert.deepEqual(filterTransactionsByTimeline(transactions, "3M").map(({ id }) => id), ["old", "recent"]);
});

test("clamps month-end ranges in UTC", () => {
  assert.equal(
    getTimelineStart([{ tradeDate: "2025-03-31T12:00:00.000Z" }], "1M")?.toISOString(),
    "2025-02-28T12:00:00.000Z"
  );
});

test("ALL starts at the first transaction and NONE leaves the input unchanged", () => {
  assert.equal(getTimelineStart(transactions, "ALL")?.toISOString(), "2025-01-15T12:00:00.000Z");
  assert.equal(filterTransactionsByTimeline(transactions, "NONE"), transactions);
});

test("derives a minimum one-month divisor for annualized metrics", () => {
  assert.equal(getMonthDivisor([], "ALL"), 1);
  assert.equal(getMonthDivisor(transactions, "ALL"), 4);
  assert.equal(annualizationFactor("3M", transactions), 4);
});
