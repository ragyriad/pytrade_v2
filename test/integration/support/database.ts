import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import postgres from "postgres";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function requireSafeTestDatabaseUrl(): string {
  const value = process.env.TEST_DATABASE_URL;
  if (!value) {
    throw new Error(
      "TEST_DATABASE_URL is required and must point at a disposable PostgreSQL database."
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("TEST_DATABASE_URL must use the postgres or postgresql protocol.");
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName.toLowerCase().includes("test")) {
    throw new Error(
      `Refusing destructive integration setup for database "${databaseName}" because its name does not contain "test".`
    );
  }

  if (
    !LOCAL_HOSTS.has(parsed.hostname) &&
    process.env.ALLOW_REMOTE_TEST_DATABASE !== "true"
  ) {
    throw new Error(
      "Remote TEST_DATABASE_URL values require ALLOW_REMOTE_TEST_DATABASE=true. Use only an ephemeral CI database."
    );
  }

  return value;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export async function resetAndMigrateTestDatabase(): Promise<void> {
  const url = requireSafeTestDatabaseUrl();
  const sql = postgres(url, { max: 1, onnotice: () => undefined });

  try {
    const [{ currentDatabase }] = await sql<{ currentDatabase: string }[]>`
      select current_database() as "currentDatabase"
    `;
    if (!currentDatabase.toLowerCase().includes("test")) {
      throw new Error(
        `Connected database "${currentDatabase}" failed the integration safety check.`
      );
    }

    await sql.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await sql.unsafe("CREATE SCHEMA public");

    const migrationsRoot = resolve(process.cwd(), "packages/db/drizzle");
    const migrationFiles = readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(migrationsRoot, entry.name, "migration.sql"))
      .filter(existsSync)
      .sort();

    if (migrationFiles.length === 0) {
      throw new Error("No database migrations were found for integration setup.");
    }

    for (const migrationFile of migrationFiles) {
      const statements = readFileSync(migrationFile, "utf8")
        .split("--> statement-breakpoint")
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await sql.unsafe(statement);
      }
    }
  } finally {
    await sql.end();
  }
}

export async function truncateApplicationTables(): Promise<void> {
  const url = requireSafeTestDatabaseUrl();
  const sql = postgres(url, { max: 1, onnotice: () => undefined });

  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename
      from pg_tables
      where schemaname = 'public'
      order by tablename
    `;
    if (tables.length === 0) return;

    const tableList = tables
      .map(({ tablename }) => `public.${quoteIdentifier(tablename)}`)
      .join(", ");
    await sql.unsafe(`TRUNCATE TABLE ${tableList} RESTART IDENTITY CASCADE`);
  } finally {
    await sql.end();
  }
}

export async function queryTestDatabase<T extends Record<string, unknown>>(
  query: string
): Promise<T[]> {
  const sql = postgres(requireSafeTestDatabaseUrl(), {
    max: 1,
    onnotice: () => undefined,
  });
  try {
    return [...await sql.unsafe<T[]>(query)];
  } finally {
    await sql.end();
  }
}
