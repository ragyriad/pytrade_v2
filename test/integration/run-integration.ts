import { spawnSync } from "node:child_process";
import { extname } from "node:path";

const COMPOSE_ARGS = ["compose", "-f", "compose.integration.yml"];
const LOCAL_TEST_DATABASE_URL =
  "postgresql://pytrade_test:pytrade_test@127.0.0.1:55432/pytrade_test";

function run(command: string, args: string[], env = process.env): number {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  return result.status ?? 1;
}

function runPnpm(args: string[], env: NodeJS.ProcessEnv): number {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) {
    throw new Error("Unable to locate the pnpm CLI for the integration runner.");
  }
  return [".js", ".cjs", ".mjs"].includes(extname(pnpmCli).toLowerCase())
    ? run(process.execPath, [pnpmCli, ...args], env)
    : run(pnpmCli, args, env);
}

function main(): void {
  const managesDocker = !process.env.TEST_DATABASE_URL;
  const testEnv = {
    ...process.env,
    TEST_DATABASE_URL:
      process.env.TEST_DATABASE_URL ?? LOCAL_TEST_DATABASE_URL,
  };
  let exitCode = 0;

  try {
    if (managesDocker) {
      exitCode = run("docker", [...COMPOSE_ARGS, "up", "-d", "--wait"]);
      if (exitCode !== 0) return;
    }

    exitCode = runPnpm(["--filter", "@repo/db", "build"], testEnv);
    if (exitCode !== 0) return;

    exitCode = runPnpm(
      ["exec", "vitest", "run", "--config", "vitest.integration.config.ts"],
      testEnv
    );
  } finally {
    if (managesDocker) {
      const cleanupExitCode = run("docker", [...COMPOSE_ARGS, "down", "-v"]);
      if (exitCode === 0) exitCode = cleanupExitCode;
    }
    process.exitCode = exitCode;
  }
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
