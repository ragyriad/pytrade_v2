import { eq } from "drizzle-orm";
import { closeDbConnection, db } from "../client.js";
import { users } from "../schemas/index_schema.js";
import { inspectDemoUserData, persistDemoScenario, resetDemoUserData } from "./persistence.js";
import { buildFullPortfolioScenario } from "./scenarios/fullPortfolio.js";
import type { DemoScenario, DemoSeedReport } from "./types.js";
import { ensureDemoApplicationUser } from "./user.js";

type Command = "seed" | "reset";

function parseArguments(argv: string[]) {
  const command = argv[0] as Command | undefined;
  if (command !== "seed" && command !== "reset") {
    throw new Error("Usage: demo/cli.ts <seed|reset> [--username=<username>] [--clerk-user-id=user_...] [--email=<email>] [--seed=<value>] [--as-of=YYYY-MM-DD] [--dry-run]");
  }
  const values = new Map<string, string>();
  let dryRun = false;
  for (const argument of argv.slice(1)) {
    if (argument === "--") continue;
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    const match = argument.match(/^--([^=]+)=(.+)$/);
    if (!match) throw new Error(`Unsupported argument: ${argument}`);
    values.set(match[1], match[2]);
  }
  const username = values.get("username")?.trim()
    || process.env.DEMO_USERNAME?.trim()
    || "demouser";
  const profile = values.get("profile") ?? "full";
  if (profile !== "full") throw new Error(`Unknown demo profile: ${profile}`);
  return {
    command,
    username,
    dryRun,
    seed: values.get("seed") ?? "pytrade-demo-v1",
    asOf: values.get("as-of") ?? new Date().toISOString().slice(0, 10),
    clerkUserId: values.get("clerk-user-id") ?? process.env.DEMO_CLERK_USER_ID,
    email: values.get("email") ?? process.env.DEMO_USER_EMAIL,
  };
}

function scenarioCounts(scenario: DemoScenario): DemoSeedReport["counts"] {
  return {
    securities: scenario.securities.length,
    accounts: scenario.accounts.length,
    accountBalances: scenario.accountBalances.length,
    accountValueHistory: scenario.accountValueHistory.length,
    positions: scenario.positions.length,
    options: scenario.options.length,
    transactions: scenario.transactions.length,
    calendarEvents: scenario.calendarEvents.length,
    priceSnapshots: scenario.priceSnapshots.length,
  };
}

async function main() {
  const args = parseArguments(process.argv.slice(2));

  if (args.command === "reset") {
    const [targetUser] = await db
      .select({ id: users.id, username: users.username })
      .from(users)
      .where(eq(users.username, args.username))
      .limit(1);
    if (!targetUser) throw new Error(`Application user "${args.username}" was not found.`);
    const affected = args.dryRun
      ? await inspectDemoUserData(db, targetUser.id)
      : await resetDemoUserData(db, targetUser.id);
    console.log(JSON.stringify({ command: "reset", dryRun: args.dryRun, username: args.username, affected }, null, 2));
    return;
  }

  const targetUser = await ensureDemoApplicationUser(db, {
    username: args.username,
    clerkUserId: args.clerkUserId,
    email: args.email,
    dryRun: args.dryRun,
  });

  const scenario = buildFullPortfolioScenario({
    userId: targetUser.id,
    username: targetUser.username,
    seed: args.seed,
    asOf: args.asOf,
  });
  const report: DemoSeedReport = args.dryRun
    ? {
        dryRun: true,
        userId: targetUser.id,
        username: targetUser.username,
        profile: scenario.metadata.profile,
        seed: scenario.metadata.seed,
        asOf: scenario.metadata.asOf,
        counts: scenarioCounts(scenario),
      }
    : await persistDemoScenario(db, scenario);
  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(closeDbConnection);
