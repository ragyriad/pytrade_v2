import { describe, expect, test } from "vitest";
import { negativeCashClassName } from "../../../app/services/cashPresentation";

describe("negativeCashClassName", () => {
  test("uses the shared negative red only for negative cash values", () => {
    expect(negativeCashClassName(-1, "text-foreground")).toBe("text-negative");
    expect(negativeCashClassName(0, "text-foreground")).toBe("text-foreground");
    expect(negativeCashClassName(1, "text-foreground")).toBe("text-foreground");
  });
});
