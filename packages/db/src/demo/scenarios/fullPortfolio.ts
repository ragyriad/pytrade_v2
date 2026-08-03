import { demoSecurityCatalog } from "../catalog/securities.js";
import {
  DemoRandom,
  addUtcDays,
  addUtcMonths,
  dateOnly,
  roundMoney,
  roundQuantity,
  stableDemoUuid,
} from "../random.js";
import type { DemoScenario } from "../types.js";

type FullPortfolioScenarioOptions = {
  userId: string;
  username: string;
  seed: string;
  asOf: string;
};

function requireAsOf(value: string): Date {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime())) {
    throw new Error("Demo as-of date must use YYYY-MM-DD format.");
  }
  return parsed;
}

function optionTicker(symbol: string, expiration: string, contractType: string, strike: number): string {
  return `${symbol}${expiration.replaceAll("-", "").slice(2)}${contractType[0].toUpperCase()}${Math.round(strike)}`;
}

export function buildFullPortfolioScenario(input: FullPortfolioScenarioOptions): DemoScenario {
  const asOfDate = requireAsOf(input.asOf);
  const random = new DemoRandom(`${input.seed}:${input.userId}:${input.asOf}`);
  const ownerPrefix = input.userId.slice(0, 8);
  const id = (kind: string, key: string) =>
    stableDemoUuid(`pytrade-demo:${input.userId}:${input.seed}:${kind}:${key}`);
  const globalId = (kind: string, key: string) => stableDemoUuid(`pytrade-demo:${kind}:${key}`);
  const marker = {
    demo: {
      ownerUserId: input.userId,
      profile: "full",
      seed: input.seed,
      asOf: input.asOf,
    },
  };

  const accountDefinitions = [
    { key: "tfsa", name: "Demo TFSA", brokerage: "Wealthsimple", currency: "CAD", type: "TFSA", balance: 4_200 },
    { key: "rrsp", name: "Demo RRSP", brokerage: "Questrade", currency: "CAD", type: "RRSP", balance: 3_600 },
    { key: "margin", name: "Demo USD Margin", brokerage: "Interactive Brokers", currency: "USD", type: "MARGIN", balance: 5_800 },
    { key: "cash", name: "Demo Cash", brokerage: "Wealthsimple", currency: "CAD", type: "CASH", balance: 12_450 },
    { key: "credit", name: "Demo Credit Card", brokerage: "Wealthsimple", currency: "CAD", type: "CREDIT CARD", balance: -1_280 },
  ] as const;
  const accountIdByKey = new Map(accountDefinitions.map((account) => [account.key, id("account", account.key)]));
  const accounts = accountDefinitions.map((account) => ({
    id: accountIdByKey.get(account.key)!,
    userId: input.userId,
    brokerageAccountNumber: `DEMO-${ownerPrefix}-${account.key.toUpperCase()}`,
    brokerageName: account.brokerage,
    accountCurrency: account.currency,
    balanceAmount: roundMoney(account.balance),
    balanceCurrency: account.currency,
    status: "active" as const,
    type: account.type,
    rawType: account.type,
    snaptradeMetaType: account.type,
    name: account.name,
    isPaper: true,
    isArchived: false,
    rawData: marker,
    openingDate: addUtcMonths(asOfDate, -30),
    fundingDate: addUtcMonths(asOfDate, -24),
    firstTransactionDate: addUtcMonths(asOfDate, -24),
    lastTransactionsSyncAt: asOfDate,
    lastHoldingsSyncAt: asOfDate,
  }));
  const accountBalances = accountDefinitions.map((account) => ({
    id: id("balance", account.key),
    accountId: accountIdByKey.get(account.key)!,
    currencyCode: account.currency,
    cash: roundMoney(account.balance),
    buyingPower: roundMoney(account.key === "margin" ? account.balance * 1.8 : Math.max(account.balance, 0)),
    source: "DEMO",
    sourceFile: `generated:${input.seed}`,
    asOfDate: input.asOf,
    syncedAt: asOfDate,
  }));
  const historyStartDate = addUtcMonths(asOfDate, -24);
  const historyDays = Math.round(
    (asOfDate.getTime() - historyStartDate.getTime()) / 86_400_000
  );
  const accountValueHistory: DemoScenario["accountValueHistory"] = [];

  for (const [accountIndex, account] of accountDefinitions.entries()) {
    const startingMultiplier = random.between(0.68, 0.9);
    for (let day = 0; day <= historyDays; day += 1) {
      const progress = day / historyDays;
      const trend = startingMultiplier + (1 - startingMultiplier) * progress;
      const variation = day === 0 || day === historyDays
        ? 0
        : Math.sin((day + accountIndex * 17) / 16) * 0.012 + random.between(-0.006, 0.006);
      const totalValue = day === historyDays
        ? account.balance
        : account.balance * trend * (1 + variation);
      accountValueHistory.push({
        id: id("account-value", `${account.key}:${dateOnly(addUtcDays(historyStartDate, day))}`),
        accountId: accountIdByKey.get(account.key)!,
        valueDate: dateOnly(addUtcDays(historyStartDate, day)),
        totalValue: roundMoney(totalValue),
        currencyCode: account.currency,
        source: "DEMO",
        syncedAt: asOfDate,
      });
    }
  }

  const shuffledCatalog = random.shuffle(demoSecurityCatalog);
  const securities: DemoScenario["securities"] = demoSecurityCatalog.map((security) => ({
    id: globalId("security", `${security.exchangeCode}:${security.symbol}`),
    securityKey: `DEMO:${security.exchangeCode}:${security.symbol}`,
    source: "DEMO",
    listingStatus: "ACTIVE",
    isArchived: false,
    symbol: security.symbol,
    rawSymbol: security.symbol,
    description: security.name,
    currencyCode: security.currency,
    exchangeCode: security.exchangeCode,
    exchangeMicCode: security.exchangeMicCode,
    exchangeName: security.exchangeCode === "TSX" ? "Toronto Stock Exchange" : security.exchangeCode,
    instrumentTypeCode: security.instrumentType === "Exchange Traded Fund" ? "et" : "eq",
    instrumentTypeDescription: security.instrumentType,
    firstSeenAt: addUtcMonths(asOfDate, -24),
    lastSeenAt: asOfDate,
  }));
  const securityIdBySymbol = new Map(securities.map((security) => [security.symbol, security.id!]));
  const accountForSecurity = (currency: "CAD" | "USD", index: number) =>
    currency === "USD"
      ? accountIdByKey.get("margin")!
      : accountIdByKey.get(index % 2 === 0 ? "tfsa" : "rrsp")!;

  const positions = shuffledCatalog.slice(0, 22).map((security, index) => {
    const currentPrice = security.referencePrice * random.between(0.82, 1.24);
    const averagePrice = currentPrice * random.between(0.72, 1.18);
    const units = security.instrumentType === "Exchange Traded Fund"
      ? random.integer(12, 80)
      : random.integer(4, 65);
    return {
      id: id("position", security.symbol),
      accountId: accountForSecurity(security.currency, index),
      securityId: securityIdBySymbol.get(security.symbol),
      symbol: security.symbol,
      rawSymbol: security.symbol,
      description: security.name,
      exchangeCode: security.exchangeCode,
      exchangeMicCode: security.exchangeMicCode,
      exchangeName: security.exchangeCode === "TSX" ? "Toronto Stock Exchange" : security.exchangeCode,
      units: roundQuantity(units),
      fractionalUnits: roundQuantity(units),
      price: roundQuantity(currentPrice),
      averagePurchasePrice: roundQuantity(averagePrice),
      openPnl: roundQuantity(units * (currentPrice - averagePrice)),
      currencyCode: security.currency,
      cashEquivalent: false,
      isQuotable: true,
      isTradable: true,
      instrumentTypeCode: security.instrumentType === "Exchange Traded Fund" ? "et" : "eq",
      instrumentTypeDescription: security.instrumentType,
      syncedAt: asOfDate,
    };
  });

  const transactions: DemoScenario["transactions"] = [];
  const addTransaction = (
    key: string,
    transaction: Omit<DemoScenario["transactions"][number], "id" | "source" | "externalTransactionId">
  ) => {
    transactions.push({
      id: id("transaction", key),
      source: "DEMO",
      externalTransactionId: `${input.userId}:${input.seed}:${key}`,
      ...transaction,
    });
  };

  shuffledCatalog.forEach((security, index) => {
    const accountId = accountForSecurity(security.currency, index);
    const securityId = securityIdBySymbol.get(security.symbol)!;
    const initialUnits = random.integer(8, 45);
    const secondUnits = random.integer(3, 25);
    const soldUnits = random.integer(1, Math.max(2, Math.floor(initialUnits / 3)));
    const tradeSpecs = [
      { suffix: "buy-1", monthsAgo: 22, action: "BUY", units: initialUnits, sign: -1 },
      { suffix: "buy-2", monthsAgo: 13, action: "BUY", units: secondUnits, sign: -1 },
      { suffix: "sell-1", monthsAgo: 6, action: "SELL", units: soldUnits, sign: 1 },
    ] as const;
    for (const trade of tradeSpecs) {
      const price = security.referencePrice * random.between(0.68, 1.16);
      addTransaction(`${security.symbol}:${trade.suffix}`, {
        accountId,
        securityId,
        type: trade.action,
        action: trade.action,
        assetType: "EQUITY",
        description: `${trade.action === "BUY" ? "Bought" : "Sold"} ${security.name}`,
        amount: roundMoney(trade.sign * price * trade.units),
        price: roundQuantity(price),
        units: roundQuantity(trade.units),
        fee: roundMoney(security.currency === "CAD" ? 4.95 : 2.5),
        currencyCode: security.currency,
        symbol: security.symbol,
        tradeDate: addUtcDays(addUtcMonths(asOfDate, -trade.monthsAgo), random.integer(-12, 12)),
        rawData: marker,
      });
    }

    if (security.dividendYield > 0) {
      for (let quarter = 0; quarter < 8; quarter += 1) {
        const paymentDate = addUtcDays(addUtcMonths(asOfDate, -(quarter * 3 + 1)), random.integer(-8, 8));
        const amount = security.referencePrice * security.dividendYield * random.between(5, 35) / 4;
        addTransaction(`${security.symbol}:dividend:${quarter}`, {
          accountId,
          securityId,
          type: "DIVIDEND",
          action: "DIVIDEND",
          assetType: "EQUITY",
          description: `${security.name} quarterly dividend`,
          amount: roundMoney(amount),
          fee: "0",
          currencyCode: security.currency,
          symbol: security.symbol,
          tradeDate: paymentDate,
          rawData: marker,
        });
        if (security.currency === "USD" && quarter % 2 === 0) {
          addTransaction(`${security.symbol}:withholding:${quarter}`, {
            accountId,
            securityId,
            type: "WITHHOLDING_TAX",
            action: "WITHHOLDING_TAX",
            assetType: "EQUITY",
            description: `Foreign withholding tax on ${security.symbol} dividend`,
            amount: roundMoney(-amount * 0.15),
            fee: "0",
            currencyCode: security.currency,
            symbol: security.symbol,
            tradeDate: paymentDate,
            rawData: marker,
          });
        }
      }
    }
  });

  // Every account receives a CAD and USD dividend history so account and
  // currency breakdowns remain populated even when a dashboard is filtered.
  for (const [accountIndex, account] of accountDefinitions.entries()) {
    for (const currency of ["CAD", "USD"] as const) {
      const dividendSecurities = demoSecurityCatalog.filter(
        (security) => security.currency === currency && security.dividendYield > 0
      );
      const security = dividendSecurities[accountIndex % dividendSecurities.length];
      const securityId = securityIdBySymbol.get(security.symbol)!;
      for (let quarter = 0; quarter < 8; quarter += 1) {
        const paymentDate = addUtcDays(
          addUtcMonths(asOfDate, -(quarter * 3 + 1)),
          random.integer(-8, 8)
        );
        const amount = security.referencePrice * security.dividendYield * random.between(4, 18) / 4;
        addTransaction(`account-dividend:${account.key}:${currency}:${quarter}`, {
          accountId: accountIdByKey.get(account.key)!,
          securityId,
          type: "DIVIDEND",
          action: "DIVIDEND",
          assetType: "EQUITY",
          description: `${security.name} quarterly dividend`,
          amount: roundMoney(amount),
          fee: "0",
          currencyCode: currency,
          symbol: security.symbol,
          tradeDate: paymentDate,
          rawData: marker,
        });
      }
    }
  }

  const cashAccountId = accountIdByKey.get("cash")!;
  const creditAccountId = accountIdByKey.get("credit")!;
  const merchants = ["Neighbourhood Market", "City Transit", "Maple Cafe", "Cloud Software", "Home Supply", "Mobile Service"];
  for (let month = 0; month < 24; month += 1) {
    const monthDate = addUtcMonths(asOfDate, -month);
    addTransaction(`cash:payroll:${month}`, {
      accountId: cashAccountId,
      type: "CASH",
      action: "DEPOSIT",
      assetType: "CASH",
      description: "Payroll deposit",
      amount: roundMoney(random.between(3_600, 4_400)),
      fee: "0",
      currencyCode: "CAD",
      tradeDate: addUtcDays(monthDate, -random.integer(0, 12)),
      rawData: marker,
    });
    addTransaction(`cash:interest:${month}`, {
      accountId: cashAccountId,
      type: "CASH",
      action: "INTEREST",
      assetType: "CASH",
      description: "Monthly cash interest",
      amount: roundMoney(random.between(18, 48)),
      fee: "0",
      currencyCode: "CAD",
      tradeDate: addUtcDays(monthDate, -2),
      rawData: marker,
    });
    for (let purchase = 0; purchase < 2; purchase += 1) {
      addTransaction(`cash:purchase:${month}:${purchase}`, {
        accountId: cashAccountId,
        type: "CASH",
        action: "PURCHASE",
        assetType: "CASH",
        description: random.pick(merchants),
        amount: roundMoney(-random.between(12, 180)),
        fee: "0",
        currencyCode: "CAD",
        tradeDate: addUtcDays(monthDate, -random.integer(1, 25)),
        rawData: marker,
      });
      addTransaction(`credit:charge:${month}:${purchase}`, {
        accountId: creditAccountId,
        type: "CREDIT_CARD",
        action: "CHARGE",
        assetType: "CASH",
        description: random.pick(merchants),
        amount: roundMoney(-random.between(25, 320)),
        fee: "0",
        currencyCode: "CAD",
        tradeDate: addUtcDays(monthDate, -random.integer(1, 25)),
        rawData: marker,
      });
    }
    const paymentAmount = random.between(280, 720);
    const paymentDate = addUtcDays(monthDate, -random.integer(3, 20));
    addTransaction(`credit:payment:${month}`, {
      accountId: creditAccountId,
      type: "CREDIT_CARD",
      action: "CREDIT_CARD_PAYMENT",
      assetType: "CASH",
      description: "Payment received",
      amount: roundMoney(paymentAmount),
      fee: "0",
      currencyCode: "CAD",
      tradeDate: paymentDate,
      rawData: marker,
    });
    addTransaction(`cash:card-payment:${month}`, {
      accountId: cashAccountId,
      type: "CASH",
      action: "CREDIT_CARD_PAYMENT",
      assetType: "CASH",
      description: "Credit card payment",
      amount: roundMoney(-paymentAmount),
      fee: "0",
      currencyCode: "CAD",
      tradeDate: paymentDate,
      rawData: marker,
    });
  }

  for (let feeIndex = 0; feeIndex < 12; feeIndex += 1) {
    const accountId = feeIndex % 2 === 0 ? accountIdByKey.get("tfsa")! : accountIdByKey.get("margin")!;
    const currency = feeIndex % 2 === 0 ? "CAD" : "USD";
    addTransaction(`account-fee:${feeIndex}`, {
      accountId,
      type: "FEE",
      action: "ACCOUNT_FEE",
      assetType: "CASH",
      description: feeIndex % 3 === 0 ? "Exchange data fee" : "Account administration fee",
      amount: roundMoney(-random.between(4, 18)),
      fee: "0",
      currencyCode: currency,
      tradeDate: addUtcMonths(asOfDate, -feeIndex * 2),
      rawData: marker,
    });
  }

  const options: DemoScenario["options"] = [];
  const optionSecurities: DemoScenario["securities"] = [];
  const optionUnderlyings = shuffledCatalog.filter((security) => security.currency === "USD").slice(0, 6);
  optionUnderlyings.forEach((underlying, index) => {
    const isFuture = index < 3;
    const expiration = dateOnly(addUtcMonths(asOfDate, isFuture ? 4 + index * 2 : -(2 + index)));
    const contractType = index % 2 === 0 ? "call" : "put";
    const strike = Math.round(underlying.referencePrice * random.between(0.85, 1.15));
    const ticker = optionTicker(underlying.symbol, expiration, contractType, strike);
    const optionSecurityId = globalId("option-security", ticker);
    const optionId = globalId("option", ticker);
    optionSecurities.push({
      id: optionSecurityId,
      securityKey: `DEMO:OPTION:${ticker}`,
      source: "DEMO",
      listingStatus: isFuture ? "ACTIVE" : "EXPIRED",
      isArchived: false,
      symbol: ticker,
      rawSymbol: underlying.symbol,
      description: `${underlying.symbol} ${expiration} ${strike} ${contractType.toUpperCase()}`,
      currencyCode: "USD",
      exchangeCode: underlying.exchangeCode,
      exchangeMicCode: underlying.exchangeMicCode,
      exchangeName: underlying.exchangeCode,
      instrumentTypeCode: "op",
      instrumentTypeDescription: "Option",
      firstSeenAt: addUtcMonths(asOfDate, -10),
      lastSeenAt: asOfDate,
    });
    options.push({
      id: optionId,
      securityId: optionSecurityId,
      underlyingSecurityId: securityIdBySymbol.get(underlying.symbol)!,
      ticker,
      contractType,
      strikePrice: roundQuantity(strike),
      expirationDate: expiration,
      multiplier: "100",
      status: isFuture ? "open" : index % 2 === 0 ? "expired" : "closed",
      isMiniOption: false,
      isArchived: false,
      rawData: marker,
      firstSeenAt: addUtcMonths(asOfDate, -10),
      lastSeenAt: asOfDate,
    });
    const premium = random.between(2.5, 14);
    addTransaction(`option:${ticker}:open`, {
      accountId: accountIdByKey.get("margin")!,
      securityId: optionSecurityId,
      underlyingSecurityId: securityIdBySymbol.get(underlying.symbol),
      optionId,
      type: "BUY",
      action: "BUY_TO_OPEN",
      optionAction: "BUY_TO_OPEN",
      assetType: "OPTION",
      description: `Opened ${ticker}`,
      amount: roundMoney(-premium * 100),
      price: roundQuantity(premium),
      units: "1",
      fee: "1.25",
      currencyCode: "USD",
      symbol: underlying.symbol,
      tradeDate: addUtcMonths(asOfDate, isFuture ? -2 : -10),
      rawData: marker,
    });
    if (!isFuture && index % 2 === 1) {
      addTransaction(`option:${ticker}:close`, {
        accountId: accountIdByKey.get("margin")!,
        securityId: optionSecurityId,
        underlyingSecurityId: securityIdBySymbol.get(underlying.symbol),
        optionId,
        type: "SELL",
        action: "SELL_TO_CLOSE",
        optionAction: "SELL_TO_CLOSE",
        assetType: "OPTION",
        description: `Closed ${ticker}`,
        amount: roundMoney(premium * random.between(70, 145)),
        price: roundQuantity(premium * random.between(0.7, 1.45)),
        units: "1",
        fee: "1.25",
        currencyCode: "USD",
        symbol: underlying.symbol,
        tradeDate: addUtcMonths(asOfDate, -4),
        rawData: marker,
      });
    }
  });
  securities.push(...optionSecurities);

  const calendarEvents: DemoScenario["calendarEvents"] = [];
  for (const security of demoSecurityCatalog) {
    const securityId = securityIdBySymbol.get(security.symbol)!;
    const earningsDate = dateOnly(addUtcDays(asOfDate, random.integer(7, 100)));
    calendarEvents.push({
      id: id("calendar", `${security.symbol}:earnings:${earningsDate}`),
      securityId,
      eventType: "EARNINGS",
      eventDate: earningsDate,
      eventName: `${security.name} earnings`,
      eventStatus: "scheduled",
      isEstimated: true,
      providerSource: "DEMO",
      providerEventId: `${input.userId}:${input.seed}:${security.symbol}:earnings:${earningsDate}`,
      canonicalKey: `DEMO:${input.userId}:${input.seed}:${security.symbol}:earnings:${earningsDate}`,
      providerTicker: security.symbol,
      symbol: security.symbol,
      currencyCode: security.currency,
      fiscalDateEnding: dateOnly(addUtcMonths(asOfDate, -1)),
      estimatedEps: roundQuantity(random.between(0.25, 8)),
      rawData: marker,
    });
    if (security.dividendYield > 0) {
      const exDate = addUtcDays(asOfDate, random.integer(4, 70));
      const paymentDate = addUtcDays(exDate, random.integer(12, 35));
      const eventDate = dateOnly(exDate);
      calendarEvents.push({
        id: id("calendar", `${security.symbol}:dividend:${eventDate}`),
        securityId,
        eventType: "DIVIDEND",
        eventDate,
        eventName: `${security.name} dividend`,
        eventStatus: "confirmed",
        isEstimated: false,
        providerSource: "DEMO",
        providerEventId: `${input.userId}:${input.seed}:${security.symbol}:dividend:${eventDate}`,
        canonicalKey: `DEMO:${input.userId}:${input.seed}:${security.symbol}:dividend:${eventDate}`,
        providerTicker: security.symbol,
        symbol: security.symbol,
        currencyCode: security.currency,
        cashAmount: roundQuantity(security.referencePrice * security.dividendYield / 4),
        exDate: eventDate,
        paymentDate: dateOnly(paymentDate),
        recordDate: dateOnly(addUtcDays(exDate, 1)),
        declarationDate: dateOnly(addUtcDays(exDate, -20)),
        frequency: "quarterly",
        distributionType: "cash",
        isSpecial: false,
        rawData: marker,
      });
    }
  }

  const priceSnapshots = demoSecurityCatalog.map((security) => {
    const close = security.referencePrice * random.between(0.9, 1.12);
    return {
      id: globalId("price", `${security.exchangeCode}:${security.symbol}:${input.asOf}`),
      securityId: securityIdBySymbol.get(security.symbol)!,
      source: "DEMO",
      providerTicker: `${security.exchangeCode}:${security.symbol}`,
      symbol: security.symbol,
      currencyCode: security.currency,
      priceDate: input.asOf,
      open: roundQuantity(close * random.between(0.98, 1.02)),
      high: roundQuantity(close * random.between(1.01, 1.04)),
      low: roundQuantity(close * random.between(0.96, 0.99)),
      close: roundQuantity(close),
      adjustedClose: roundQuantity(close),
      volume: String(random.integer(500_000, 15_000_000)),
      rawData: { demo: true },
    };
  });

  return {
    metadata: {
      profile: "full",
      seed: input.seed,
      asOf: input.asOf,
      userId: input.userId,
      username: input.username,
    },
    catalog: demoSecurityCatalog,
    securities,
    accounts,
    accountBalances,
    accountValueHistory,
    positions,
    options,
    transactions: transactions.sort(
      (left, right) => new Date(left.tradeDate).getTime() - new Date(right.tradeDate).getTime()
    ),
    calendarEvents,
    priceSnapshots,
  };
}
