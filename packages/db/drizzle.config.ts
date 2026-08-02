import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as dotenv from "dotenv";
import type { Config } from "drizzle-kit";

function getWorkspaceEnvPath() {
  let currentDir = process.cwd();

  while (true) {
    const packageJsonPath = resolve(currentDir, "package.json");

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

      if (packageJson.name === "pytrade") {
        return resolve(currentDir, ".env");
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      throw new Error("Unable to locate the PyTrade workspace root .env file.");
    }

    currentDir = parentDir;
  }
}

dotenv.config({ path: getWorkspaceEnvPath() });

process.on('uncaughtException', (err) => {
  console.error(err.stack);
  process.exit(1);
});

export default {
  schema: "./src/schemas/index_schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
