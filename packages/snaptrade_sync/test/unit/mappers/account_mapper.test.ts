import { assert, test } from "vitest";
import { mapSnaptradeAccount } from "../../../src/mappers/account_mapper.js";

test("maps provider account type to subtype and leaves manual classification unset", () => {
  const mapped = mapSnaptradeAccount({
    id: "00000000-0000-4000-8000-000000000001",
    number: "TFSA-001",
    name: "TFSA",
    institution_name: "Brokerage",
    meta: { type: "REGISTERED", unifiedAccountType: "TFSA" },
    balance: { total: { amount: 123, currency: "CAD" } },
  } as never, "00000000-0000-4000-8000-000000000002");

  assert.equal(mapped.type, null);
  assert.equal(mapped.management, null);
  assert.equal(mapped.isRegistered, true);
  assert.equal(mapped.subType, "TFSA");
  assert.equal(mapped.snaptradeMetaType, "REGISTERED");
  assert.equal(mapped.snaptradeUnifiedAccountType, "TFSA");
});

test("marks non-registered SnapTrade accounts as unregistered", () => {
  const mapped = mapSnaptradeAccount({
    id: "00000000-0000-4000-8000-000000000003",
    number: "MARGIN-001",
    name: "Margin",
    institution_name: "Brokerage",
    meta: { type: "MARGIN", unifiedAccountType: "MARGIN" },
  } as never, "00000000-0000-4000-8000-000000000002");

  assert.equal(mapped.isRegistered, false);
});
