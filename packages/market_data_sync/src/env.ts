import * as dotenv from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function getWorkspaceParentEnvPath() {
  let currentDir = process.cwd();

  while (true) {
    const packageJsonPath = resolve(currentDir, "package.json");

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));

      if (packageJson.name === "pytrade") {
        return resolve(currentDir, "../.env");
      }
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return resolve(process.cwd(), "../.env");
    }

    currentDir = parentDir;
  }
}

export function loadMarketDataEnv() {
  dotenv.config({ path: getWorkspaceParentEnvPath(), override: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
