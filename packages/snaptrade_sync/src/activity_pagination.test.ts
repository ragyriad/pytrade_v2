import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchAllActivityPages,
  SNAPTRADE_ACTIVITY_PAGE_SIZE,
} from "./activity_pagination.ts";

test("continues beyond SnapTrade's 1,000 activity response limit", async () => {
  const source = Array.from({ length: 2_005 }, (_, index) => index);
  const calls: Array<{ offset: number; limit: number }> = [];
  const result = await fetchAllActivityPages(async (offset, limit) => {
    calls.push({ offset, limit });
    return source.slice(offset, offset + limit);
  });

  assert.equal(result.length, 2_005);
  assert.deepEqual(calls, [
    { offset: 0, limit: SNAPTRADE_ACTIVITY_PAGE_SIZE },
    { offset: 1_000, limit: SNAPTRADE_ACTIVITY_PAGE_SIZE },
    { offset: 2_000, limit: SNAPTRADE_ACTIVITY_PAGE_SIZE },
  ]);
});
