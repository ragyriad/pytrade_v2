import { describe, expect, it } from "vitest";
import { demoSecurityCatalog } from "../../src/demo/catalog/securities.js";
import { buildFullPortfolioScenario } from "../../src/demo/scenarios/fullPortfolio.js";

const baseInput = {
  userId: "11111111-1111-4111-8111-111111111111",
  username: "demouser",
  seed: "catalog-test",
  asOf: "2026-08-02",
};

describe("full demo portfolio scenario", () => {
  it("is deterministic for the same user, seed, and as-of date", () => {
    expect(buildFullPortfolioScenario(baseInput)).toEqual(buildFullPortfolioScenario(baseInput));
  });

  it("uses exactly 26 unique underlyings without persisting industry data", () => {
    expect(demoSecurityCatalog).toHaveLength(26);
    expect(new Set(demoSecurityCatalog.map((security) => security.symbol)).size).toBe(26);
    expect(demoSecurityCatalog.every((security) => !("industry" in security))).toBe(true);

    const scenario = buildFullPortfolioScenario(baseInput);
    const underlyings = scenario.securities.filter((security) => security.instrumentTypeCode !== "op");
    expect(underlyings).toHaveLength(26);
    expect(underlyings.every((security) => !("industry" in security))).toBe(true);
  });

  it("covers every dashboard with a substantial two-year dataset", () => {
    const scenario = buildFullPortfolioScenario(baseInput);
    const accountSubTypes = new Set(scenario.accounts.map((account) => account.subType));
    const accountTypes = new Set(scenario.accounts.map((account) => account.type));
    const actions = new Set(scenario.transactions.map((transaction) => transaction.action));
    const eventTypes = new Set(scenario.calendarEvents.map((event) => event.eventType));

    expect(scenario.accounts).toHaveLength(6);
    expect(accountSubTypes).toEqual(new Set(["TFSA", "RRSP", "MARGIN", "CASH", "CREDIT CARD"]));
    expect(accountTypes).toEqual(new Set(["Investment", "Cash", "Card"]));
    expect(scenario.accounts.filter((account) => account.type === "Investment")).toHaveLength(4);
    expect(scenario.accounts.filter((account) => account.type === "Cash" || account.type === "Card")).toHaveLength(2);
    expect(new Set(scenario.accounts.filter((account) => account.isRegistered).map((account) => account.subType))).toEqual(
      new Set(["TFSA", "RRSP"])
    );
    const closedAccount = scenario.accounts.find((account) => account.status === "closed");
    expect(closedAccount).toMatchObject({ type: "Investment", subType: "TFSA", isRegistered: true });
    expect(scenario.positions.some((position) => position.accountId === closedAccount?.id)).toBe(true);
    expect(scenario.transactions.some((transaction) => transaction.accountId === closedAccount?.id)).toBe(true);
    expect(scenario.accounts.find((account) => account.subType === "RRSP")?.management).toBe("Managed");
    expect(scenario.accounts.find((account) => account.subType === "TFSA")?.management).toBe("Self-Managed");
    expect(scenario.positions.length).toBeGreaterThanOrEqual(20);
    expect(scenario.transactions.length).toBeGreaterThan(330);
    for (const action of [
      "BUY",
      "SELL",
      "DIVIDEND",
      "WITHHOLDING_TAX",
      "ACCOUNT_FEE",
      "DEPOSIT",
      "INTEREST",
      "PURCHASE",
      "CHARGE",
      "CREDIT_CARD_PAYMENT",
      "BUY_TO_OPEN",
      "SELL_TO_CLOSE",
    ]) {
      expect(actions.has(action)).toBe(true);
    }
    expect(eventTypes).toEqual(new Set(["EARNINGS", "DIVIDEND"]));
    expect(scenario.priceSnapshots).toHaveLength(26);
    expect(scenario.accountValueHistory).toHaveLength(scenario.accounts.length * 731);
  });

  it("gives every account CAD and USD dividend history", () => {
    const scenario = buildFullPortfolioScenario(baseInput);
    const dividendCurrenciesByAccount = new Map<string, Set<string>>();

    for (const transaction of scenario.transactions) {
      if (transaction.action !== "DIVIDEND") continue;
      const currencies = dividendCurrenciesByAccount.get(transaction.accountId) ?? new Set<string>();
      currencies.add(transaction.currencyCode!);
      dividendCurrenciesByAccount.set(transaction.accountId, currencies);
    }

    for (const account of scenario.accounts) {
      expect(dividendCurrenciesByAccount.get(account.id)).toEqual(new Set(["CAD", "USD"]));
    }
  });

  it("gives every account a complete daily value history ending at its current balance", () => {
    const scenario = buildFullPortfolioScenario(baseInput);
    const historyByAccount = new Map<string, typeof scenario.accountValueHistory>();
    for (const value of scenario.accountValueHistory) {
      const values = historyByAccount.get(value.accountId) ?? [];
      values.push(value);
      historyByAccount.set(value.accountId, values);
    }

    for (const account of scenario.accounts) {
      const values = historyByAccount.get(account.id)!;
      expect(values).toHaveLength(731);
      expect(values[0]?.valueDate).toBe("2024-08-02");
      expect(values.at(-1)).toMatchObject({
        valueDate: baseInput.asOf,
        totalValue: account.balanceAmount,
        currencyCode: account.accountCurrency,
        source: "DEMO",
      });
    }
  });

  it("includes open, closed, and expired option examples", () => {
    const scenario = buildFullPortfolioScenario(baseInput);
    expect(scenario.options).toHaveLength(6);
    expect(new Set(scenario.options.map((option) => option.status))).toEqual(
      new Set(["open", "closed", "expired"])
    );
    expect(scenario.transactions.some((transaction) => transaction.assetType === "OPTION")).toBe(true);
  });

  it("seeds account registration, subtype, and status values for filter demos", () => {
    const scenario = buildFullPortfolioScenario(baseInput);
    expect(scenario.accounts.every((account) => typeof account.isRegistered === "boolean")).toBe(true);
    expect(scenario.accounts.every((account) => typeof account.subType === "string")).toBe(true);
    expect(new Set(scenario.accounts.map((account) => account.status))).toEqual(
      new Set(["active", "closed"])
    );
  });

  it("marks every replaceable row with the target demo owner", () => {
    const scenario = buildFullPortfolioScenario(baseInput);
    for (const account of scenario.accounts) {
      expect(account.rawData).toMatchObject({ demo: { ownerUserId: baseInput.userId } });
    }
    for (const transaction of scenario.transactions) {
      expect(transaction.source).toBe("DEMO");
      expect(transaction.externalTransactionId).toMatch(`${baseInput.userId}:${baseInput.seed}:`);
    }
    for (const event of scenario.calendarEvents) {
      expect(event.providerSource).toBe("DEMO");
      expect(event.providerEventId).toMatch(`${baseInput.userId}:${baseInput.seed}:`);
    }
  });

  it("changes generated values when the seed changes while retaining profile shape", () => {
    const first = buildFullPortfolioScenario(baseInput);
    const second = buildFullPortfolioScenario({ ...baseInput, seed: "another-seed" });
    expect(second.accounts).toHaveLength(first.accounts.length);
    expect(second.securities).toHaveLength(first.securities.length);
    expect(second.transactions).toHaveLength(first.transactions.length);
    expect(second.accountValueHistory).toHaveLength(first.accountValueHistory.length);
    expect(second.transactions.map((transaction) => transaction.amount)).not.toEqual(
      first.transactions.map((transaction) => transaction.amount)
    );
  });
});
