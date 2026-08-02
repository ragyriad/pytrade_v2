import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function getWorkspaceEnvPath() {
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

export function loadMarketDataEnv() {
  dotenv.config({ path: getWorkspaceEnvPath(), override: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
