import { spawn } from "node:child_process";

const apiPort = process.env.API_PORT ?? "3001";
const webPort = process.env.PORT ?? "3000";

const processes = [
  {
    name: "api",
    child: spawn(process.execPath, ["apps/api/dist/src/server.js"], {
      cwd: process.cwd(),
      env: { ...process.env, API_PORT: apiPort },
      stdio: "inherit",
    }),
  },
  {
    name: "web",
    child: spawn(
      process.execPath,
      ["apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", webPort, "-H", "0.0.0.0"],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      }
    ),
  },
];

let shuttingDown = false;
let exitCode = 0;
const running = new Set(processes.map(({ child }) => child));

function stop(exitStatus) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = exitStatus;

  for (const { child } of processes) {
    if (!child.killed) child.kill("SIGTERM");
  }

  setTimeout(() => {
    for (const { child } of processes) {
      if (!child.killed) child.kill("SIGKILL");
    }
    process.exit(exitCode);
  }, 10_000).unref();
}

for (const { name, child } of processes) {
  child.once("error", (error) => {
    console.error(`${name} process could not start`, error);
    stop(1);
  });
  child.once("close", (code, signal) => {
    running.delete(child);
    if (!shuttingDown) {
      console.error(`${name} process exited unexpectedly`, { code, signal });
      stop(code && code !== 0 ? code : 1);
    }
    if (shuttingDown && running.size === 0) process.exit(exitCode);
  });
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));
