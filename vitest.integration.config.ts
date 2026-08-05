import { defineConfig } from "vitest/config";

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

export default defineConfig({
  test: {
    include: [
      "apps/*/test/integration/**/*.test.{ts,tsx}",
      "packages/*/test/integration/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/dist/**"],
    environment: "node",
    globalSetup: ["test/integration/global-setup.ts"],
    setupFiles: ["test/integration/setup-env.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    passWithNoTests: false,
  },
});
