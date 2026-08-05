import { resetAndMigrateTestDatabase } from "./support/database";

export default async function globalSetup() {
  await resetAndMigrateTestDatabase();
}
