import assert from "node:assert/strict";
import test from "node:test";
import { parseCsv } from "./csv.js";

test("parseCsv handles quoted commas and escaped quotes", () => {
  const rows = parseCsv(
    'symbol,name,reportDate\r\nAAPL,"Apple, Inc.","2026-07-30"\r\nX,"A ""quoted"" name",2026-08-01\r\n'
  );

  assert.deepEqual(rows, [
    {
      symbol: "AAPL",
      name: "Apple, Inc.",
      reportDate: "2026-07-30",
    },
    {
      symbol: "X",
      name: 'A "quoted" name',
      reportDate: "2026-08-01",
    },
  ]);
});
