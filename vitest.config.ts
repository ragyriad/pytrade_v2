import { defineConfig } from "vitest/config";

// Some pure unit-test modules import @repo/db for schema types and helpers.
// Give module initialization a valid, non-production URL; these suites never
// connect to it. PostgreSQL integration tests use their separate config and a
// real disposable database.
process.env.DATABASE_URL ??=
  "postgresql://unit:unit@127.0.0.1:5432/pytrade_unit_test";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          include: [
            "apps/*/test/unit/**/*.test.{ts,tsx}",
            "apps/*/test/services/**/*.test.{ts,tsx}",
            "apps/*/test/auth/**/*.test.{ts,tsx}",
            "apps/*/test/http/**/*.test.{ts,tsx}",
            "apps/*/test/trpc/**/*.test.{ts,tsx}",
            "packages/*/test/unit/**/*.test.{ts,tsx}",
            "packages/*/test/invariants/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/node_modules/**", "**/dist/**", "**/test/integration/**"],
          environment: "node",
          restoreMocks: true,
          clearMocks: true,
        },
      },
      {
        test: {
          name: "components",
          include: [
            "apps/web/test/components/**/*.test.tsx",
            "apps/web/test/pages/**/*.test.tsx",
          ],
          environment: "jsdom",
          setupFiles: ["apps/web/test/setup.ts"],
          restoreMocks: true,
          clearMocks: true,
        },
      },
    ],
  },
});
