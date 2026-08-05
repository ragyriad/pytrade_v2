import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

describe("global currency colors", () => {
  test("keeps CAD metallic blue and USD dark yellow", () => {
    const themeCss = readFileSync(
      new URL("../../app/assets/styles/theme.css", import.meta.url),
      "utf8"
    );

    expect(themeCss).toContain("--color-currency-cad: #3f6f8f;");
    expect(themeCss).toContain("--color-currency-usd: #a67c00;");
  });
});
