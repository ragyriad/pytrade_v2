import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/*/test/integration/**/*.test.{ts,tsx}",
      "packages/*/test/integration/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: true,
  },
});
