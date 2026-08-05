import { requireSafeTestDatabaseUrl } from "./support/database";

const testDatabaseUrl = requireSafeTestDatabaseUrl();

// @repo/db reads DATABASE_URL while its module is initialized. Integration
// workers must never inherit the application's normal database connection.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY ?? "sk_test_integration";
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? "http://localhost:3000";
process.env.PYTRADE_API_NO_LISTEN = "true";
