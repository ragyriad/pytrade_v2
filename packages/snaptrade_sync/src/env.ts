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
