import { and, eq, inArray, like, sql } from "drizzle-orm";
import type { DB } from "../client.js";
import {
  accountBalances,
  accountValueHistory,
  accounts,
  calendarEvents,
  options,
  positions,
  securities,
  securityPriceSnapshots,
  transactions,
} from "../schemas/index_schema.js";
import type { DemoScenario, DemoSeedReport } from "./types.js";

type DatabaseExecutor = Parameters<Parameters<DB["transaction"]>[0]>[0];

function batches<T>(values: T[], size = 250): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function insertBatches<T>(
  values: T[],
  insert: (batch: T[]) => Promise<unknown>
): Promise<void> {
  for (const batch of batches(values)) await insert(batch);
}

async function demoAccountIds(db: DatabaseExecutor, userId: string): Promise<string[]> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        sql`${accounts.rawData}->'demo'->>'ownerUserId' = ${userId}`
      )
    );
  return rows.map((row) => row.id);
}

async function resetInsideTransaction(db: DatabaseExecutor, userId: string) {
  const accountIds = await demoAccountIds(db, userId);
  const deletedCalendarEvents = await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.providerSource, "DEMO"),
        like(calendarEvents.providerEventId, `${userId}:%`)
      )
    )
    .returning({ id: calendarEvents.id });

  let deletedAccounts: { id: string }[] = [];
  if (accountIds.length > 0) {
    deletedAccounts = await db
      .delete(accounts)
      .where(inArray(accounts.id, accountIds))
      .returning({ id: accounts.id });
  }
  return {
    accounts: deletedAccounts.length,
    calendarEvents: deletedCalendarEvents.length,
  };
}

export async function resetDemoUserData(db: DB, userId: string) {
  return db.transaction((tx) => resetInsideTransaction(tx, userId));
}

export async function inspectDemoUserData(db: DB, userId: string) {
  return db.transaction(async (tx) => {
    const accountIds = await demoAccountIds(tx, userId);
    const eventRows = await tx
      .select({ id: calendarEvents.id })
      .from(calendarEvents)
      .where(
        and(
          eq(calendarEvents.providerSource, "DEMO"),
          like(calendarEvents.providerEventId, `${userId}:%`)
        )
      );
    return { accounts: accountIds.length, calendarEvents: eventRows.length };
  });
}

async function resolveSecurities(db: DatabaseExecutor, scenario: DemoScenario) {
  const symbols = [...new Set(scenario.securities.map((security) => security.symbol))];
  const existing = symbols.length
    ? await db.select().from(securities).where(inArray(securities.symbol, symbols))
    : [];
  const idMap = new Map<string, string>();
  let inserted = 0;

  for (const generated of scenario.securities) {
    const exactKey = existing.find((candidate) => candidate.securityKey === generated.securityKey);
    const sameListing = existing.find(
      (candidate) =>
        generated.instrumentTypeCode !== "op" &&
        candidate.instrumentTypeCode !== "op" &&
        candidate.symbol === generated.symbol &&
        candidate.currencyCode === generated.currencyCode &&
        candidate.exchangeCode === generated.exchangeCode
    );
    const match = exactKey ?? sameListing;
    if (match) {
      idMap.set(generated.id!, match.id);
      continue;
    }
    const [created] = await db.insert(securities).values(generated).returning({ id: securities.id });
    idMap.set(generated.id!, created.id);
    existing.push({ ...generated, id: created.id } as (typeof existing)[number]);
    inserted += 1;
  }
  return { idMap, inserted, reused: scenario.securities.length - inserted };
}

async function resolveOptions(
  db: DatabaseExecutor,
  scenario: DemoScenario,
  securityIdMap: Map<string, string>
) {
  const tickers = scenario.options.map((option) => option.ticker);
  const existing = tickers.length
    ? await db.select().from(options).where(inArray(options.ticker, tickers))
    : [];
  const idMap = new Map<string, string>();

  for (const generated of scenario.options) {
    const match = existing.find((candidate) => candidate.ticker === generated.ticker);
    if (match) {
      idMap.set(generated.id!, match.id);
      continue;
    }
    const value = {
      ...generated,
      securityId: securityIdMap.get(generated.securityId)!,
      underlyingSecurityId: securityIdMap.get(generated.underlyingSecurityId)!,
    };
    const [created] = await db.insert(options).values(value).returning({ id: options.id });
    idMap.set(generated.id!, created.id);
    existing.push({ ...value, id: created.id } as (typeof existing)[number]);
  }
  return idMap;
}

export async function persistDemoScenario(db: DB, scenario: DemoScenario): Promise<DemoSeedReport> {
  return db.transaction(async (tx) => {
    await resetInsideTransaction(tx, scenario.metadata.userId);
    const securityResolution = await resolveSecurities(tx, scenario);
    const optionIdMap = await resolveOptions(tx, scenario, securityResolution.idMap);

    await tx.insert(accounts).values(scenario.accounts);
    await tx.insert(accountBalances).values(scenario.accountBalances);
    await insertBatches(scenario.accountValueHistory, (batch) =>
      tx.insert(accountValueHistory).values(batch)
    );
    await tx.insert(positions).values(
      scenario.positions.map((position) => ({
        ...position,
        securityId: position.securityId ? securityResolution.idMap.get(position.securityId) : undefined,
      }))
    );
    await insertBatches(scenario.transactions, (batch) =>
      tx.insert(transactions).values(
        batch.map((transaction) => ({
          ...transaction,
          securityId: transaction.securityId
            ? securityResolution.idMap.get(transaction.securityId)
            : undefined,
          underlyingSecurityId: transaction.underlyingSecurityId
            ? securityResolution.idMap.get(transaction.underlyingSecurityId)
            : undefined,
          optionId: transaction.optionId ? optionIdMap.get(transaction.optionId) : undefined,
        }))
      )
    );
    await tx.insert(calendarEvents).values(
      scenario.calendarEvents.map((event) => ({
        ...event,
        securityId: event.securityId ? securityResolution.idMap.get(event.securityId) : null,
      }))
    );
    await tx
      .insert(securityPriceSnapshots)
      .values(
        scenario.priceSnapshots.map((snapshot) => ({
          ...snapshot,
          securityId: securityResolution.idMap.get(snapshot.securityId)!,
        }))
      )
      .onConflictDoNothing();

    return {
      dryRun: false,
      profile: scenario.metadata.profile,
      username: scenario.metadata.username,
      userId: scenario.metadata.userId,
      seed: scenario.metadata.seed,
      asOf: scenario.metadata.asOf,
      counts: {
        accounts: scenario.accounts.length,
        accountBalances: scenario.accountBalances.length,
        accountValueHistory: scenario.accountValueHistory.length,
        securities: scenario.securities.length,
        positions: scenario.positions.length,
        options: scenario.options.length,
        transactions: scenario.transactions.length,
        calendarEvents: scenario.calendarEvents.length,
        priceSnapshots: scenario.priceSnapshots.length,
      },
      insertedSecurities: securityResolution.inserted,
      reusedSecurities: securityResolution.reused,
    };
  });
}
