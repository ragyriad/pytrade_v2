import { absoluteMoney, divideMoney, groupMoney } from "./value_helpers";
import { annualizationFactor, getMonthDivisor, type TimelineRange } from "./filter_timeline";
import type { MoneyBreakdownDto, PositionDto, TransactionDto } from "../lib/portfolio-types";

export type DividendPositionYield = {
  id: string;
  symbol: string;
  description: string | null;
  accountId: string | null;
  units: number;
  accountSegments: Array<{
    accountId: string;
    dividendAmount: MoneyBreakdownDto;
  }>;
  dividendAmount: MoneyBreakdownDto;
  annualizedDividendAmount: MoneyBreakdownDto;
  marketValue: MoneyBreakdownDto;
  costBasis: MoneyBreakdownDto;
  costPerUnit: MoneyBreakdownDto;
  dividendPerShare: MoneyBreakdownDto;
  annualizedDividendPerShare: MoneyBreakdownDto;
  yieldOnCostPercent: number;
};

export type DividendYieldingPositionRow = {
  id: string;
  symbol: string;
  description: string | null;
  accountId: string;
  status: "open" | "closed";
  totalDividends: MoneyBreakdownDto;
  currentYieldPercent: number | null;
  yieldOnCostPercent: number | null;
};

export function getDividendTotals(transactions: TransactionDto[]): MoneyBreakdownDto[] {
  return groupMoney(transactions.map((transaction) => absoluteMoney(transaction.amount)));
}

export function getAverageMonthlyDividends(
  transactions: TransactionDto[],
  range: TimelineRange
): MoneyBreakdownDto[] {
  return divideMoney(getDividendTotals(transactions), getMonthDivisor(transactions, range));
}

export function getDividendYieldOnCostPercent(
  transactions: TransactionDto[],
  positions: PositionDto[],
  range: TimelineRange
): number | null {
  const costBasis = positions.reduce((sum, position) => {
    if (position.isCashEquivalent || position.units <= 0) return sum;
    return sum + getPositionCostBasis(position);
  }, 0);

  if (costBasis === 0) return null;

  const totalDividendAmount = getDividendTotals(transactions).reduce(
    (sum, value) => sum + value.amount,
    0
  );
  const annualizedDividendAmount = totalDividendAmount * annualizationFactor(range, transactions);

  return (annualizedDividendAmount / costBasis) * 100;
}

function getPositionCostBasis(position: PositionDto): number {
  if (position.averagePurchasePrice && position.averagePurchasePrice.amount > 0) {
    return position.averagePurchasePrice.amount * position.units;
  }

  return position.marketValue.amount - (position.unrealizedGainLoss?.amount ?? 0);
}

function positionDividendKey(position: Pick<PositionDto, "accountId" | "symbol">): string {
  return `${position.accountId}:${position.symbol.toUpperCase()}`;
}

function transactionDividendKey(
  transaction: Pick<TransactionDto, "accountId" | "symbol">
): string | null {
  if (!transaction.symbol) return null;
  return `${transaction.accountId}:${transaction.symbol.toUpperCase()}`;
}

function transactionDividendCurrencyKey(transaction: TransactionDto): string | null {
  const key = transactionDividendKey(transaction);
  if (!key) return null;
  return `${key}:${transaction.amount.currency}`;
}

function getSignedUnitChange(transaction: TransactionDto): number {
  if (transaction.units == null) return 0;

  const action = (transaction.action ?? transaction.type).toUpperCase();
  if (action.includes("BUY")) return Math.abs(transaction.units);
  if (action.includes("SELL")) return -Math.abs(transaction.units);

  return 0;
}

function getUnitsHeldFromTransactions(
  accountId: string,
  symbol: string,
  allTransactions: TransactionDto[],
  tradeDate: string
): number | null {
  const key = `${accountId}:${symbol.toUpperCase()}`;
  const targetTime = new Date(tradeDate).getTime();
  const units = allTransactions.reduce((sum, transaction) => {
    if (transactionDividendKey(transaction) !== key) return sum;
    if (new Date(transaction.tradeDate).getTime() > targetTime) return sum;
    return sum + getSignedUnitChange(transaction);
  }, 0);

  return units > 0 ? units : null;
}

function getUnitsHeldOnDate(
  position: PositionDto,
  allTransactions: TransactionDto[],
  tradeDate: string
): number | null {
  const key = positionDividendKey(position);
  const targetTime = new Date(tradeDate).getTime();
  const unitsChangedAfterDate = allTransactions.reduce((sum, transaction) => {
    if (transactionDividendKey(transaction) !== key) return sum;
    if (new Date(transaction.tradeDate).getTime() <= targetTime) return sum;
    return sum + getSignedUnitChange(transaction);
  }, 0);
  const units = position.units - unitsChangedAfterDate;

  return units > 0 ? units : null;
}

function getAverageBuyCostPerUnit(
  accountId: string,
  symbol: string,
  currency: string,
  allTransactions: TransactionDto[]
): number | null {
  const key = `${accountId}:${symbol.toUpperCase()}`;
  let totalUnits = 0;
  let totalCost = 0;

  for (const transaction of allTransactions) {
    if (transactionDividendKey(transaction) !== key) continue;
    if (transaction.amount.currency !== currency) continue;

    const action = (transaction.action ?? transaction.type).toUpperCase();
    if (!action.includes("BUY") || transaction.units == null) continue;

    const units = Math.abs(transaction.units);
    if (units <= 0) continue;

    totalUnits += units;
    totalCost += Math.abs(transaction.amount.amount) + Math.abs(transaction.fee.amount);
  }

  return totalUnits > 0 ? totalCost / totalUnits : null;
}

function getPositionPriceBySymbol(positions: PositionDto[]): Map<string, MoneyBreakdownDto> {
  const pricesBySymbol = new Map<string, MoneyBreakdownDto>();

  for (const position of positions) {
    if (!position.price || position.price.amount <= 0) continue;
    pricesBySymbol.set(position.symbol.toUpperCase(), position.price);
  }

  return pricesBySymbol;
}

function combineDividendYieldRows(rows: DividendPositionYield[]): DividendPositionYield[] {
  const rowsBySymbol = new Map<string, DividendPositionYield>();

  for (const row of rows) {
    const key = row.symbol.toUpperCase();
    const current = rowsBySymbol.get(key);

    if (!current) {
      rowsBySymbol.set(key, {
        ...row,
        id: key,
        accountId: null,
      });
      continue;
    }

    const annualizedAmount =
      current.annualizedDividendAmount.amount + row.annualizedDividendAmount.amount;
    const costBasis = current.costBasis.amount + row.costBasis.amount;
    const marketValue = current.marketValue.amount + row.marketValue.amount;
    const dividendAmount = current.dividendAmount.amount + row.dividendAmount.amount;
    const units = current.units + row.units;
    const segmentsByAccount = new Map(
      current.accountSegments.map((segment) => [segment.accountId, segment])
    );

    for (const segment of row.accountSegments) {
      const currentSegment = segmentsByAccount.get(segment.accountId);
      segmentsByAccount.set(segment.accountId, {
        accountId: segment.accountId,
        dividendAmount: {
          amount:
            (currentSegment?.dividendAmount.amount ?? 0) + segment.dividendAmount.amount,
          currency: currentSegment?.dividendAmount.currency ?? segment.dividendAmount.currency,
        },
      });
    }

    rowsBySymbol.set(key, {
      ...current,
      description: current.description ?? row.description,
      units,
      accountSegments: Array.from(segmentsByAccount.values()).sort(
        (a, b) => b.dividendAmount.amount - a.dividendAmount.amount
      ),
      dividendAmount: {
        amount: dividendAmount,
        currency: current.dividendAmount.currency,
      },
      annualizedDividendAmount: {
        amount: annualizedAmount,
        currency: current.annualizedDividendAmount.currency,
      },
      marketValue: {
        amount: marketValue,
        currency: current.marketValue.currency,
      },
      dividendPerShare: {
        amount: units > 0 ? dividendAmount / units : current.dividendPerShare.amount,
        currency: current.dividendPerShare.currency,
      },
      annualizedDividendPerShare: {
        amount:
          units > 0
            ? annualizedAmount / units
            : current.annualizedDividendPerShare.amount,
        currency: current.annualizedDividendPerShare.currency,
      },
      costBasis: {
        amount: costBasis,
        currency: current.costBasis.currency,
      },
      costPerUnit: {
        amount: units > 0 ? costBasis / units : current.costPerUnit.amount,
        currency: current.costPerUnit.currency,
      },
      yieldOnCostPercent: costBasis > 0 ? (annualizedAmount / costBasis) * 100 : 0,
    });
  }

  return Array.from(rowsBySymbol.values()).sort(
    (a, b) => b.dividendAmount.amount - a.dividendAmount.amount
  );
}

export function getDividendYieldingPositionRows(
  dividendTransactions: TransactionDto[],
  allTransactions: TransactionDto[],
  positions: PositionDto[],
  range: TimelineRange
): DividendYieldingPositionRow[] {
  const positionsByKey = new Map(
    positions.map((position) => [positionDividendKey(position), position])
  );
  const pricesBySymbol = getPositionPriceBySymbol(positions);
  const rowsByKey = new Map<
    string,
    {
      accountId: string;
      symbol: string;
      description: string | null;
      currency: string;
      totalDividends: number;
      dividendPerShare: number;
      transactions: TransactionDto[];
    }
  >();

  for (const transaction of dividendTransactions) {
    const key = transactionDividendCurrencyKey(transaction);
    if (!key || !transaction.symbol) continue;

    const current = rowsByKey.get(key);
    const amount = Math.abs(transaction.amount.amount);
    const unitsHeld = getUnitsHeldFromTransactions(
      transaction.accountId,
      transaction.symbol,
      allTransactions,
      transaction.tradeDate
    );

    rowsByKey.set(key, {
      accountId: transaction.accountId,
      symbol: transaction.symbol,
      description: current?.description ?? transaction.description,
      currency: transaction.amount.currency,
      totalDividends: (current?.totalDividends ?? 0) + amount,
      dividendPerShare:
        (current?.dividendPerShare ?? 0) + (unitsHeld ? amount / unitsHeld : 0),
      transactions: [...(current?.transactions ?? []), transaction],
    });
  }

  return Array.from(rowsByKey.values())
    .map((row): DividendYieldingPositionRow => {
      const position = positionsByKey.get(
        `${row.accountId}:${row.symbol.toUpperCase()}`
      );
      const isOpen = Boolean(position && position.units > 0 && !position.isCashEquivalent);
      const annualizedDividendPerShare =
        row.dividendPerShare * annualizationFactor(range, row.transactions);
      const annualizedDividendAmount = isOpen
        ? annualizedDividendPerShare * (position?.units ?? 0)
        : null;
      const marketValue =
        isOpen && position ? position.marketValue.amount : null;
      const currentPrice = pricesBySymbol.get(row.symbol.toUpperCase());
      const currentYieldPercent =
        annualizedDividendAmount != null && marketValue && marketValue > 0
          ? (annualizedDividendAmount / marketValue) * 100
          : currentPrice?.currency === row.currency && currentPrice.amount > 0
            ? (annualizedDividendPerShare / currentPrice.amount) * 100
            : null;
      const costPerUnit =
        isOpen && position
          ? getPositionCostBasis(position) / position.units
          : getAverageBuyCostPerUnit(row.accountId, row.symbol, row.currency, allTransactions);

      return {
        id: `${row.accountId}:${row.symbol.toUpperCase()}:${row.currency}`,
        symbol: row.symbol,
        description: row.description,
        accountId: row.accountId,
        status: isOpen ? "open" : "closed",
        totalDividends: {
          amount: row.totalDividends,
          currency: row.currency,
        },
        currentYieldPercent,
        yieldOnCostPercent:
          costPerUnit && costPerUnit > 0
            ? (annualizedDividendPerShare / costPerUnit) * 100
            : null,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "open" ? -1 : 1;
      return b.totalDividends.amount - a.totalDividends.amount;
    });
}

export function getActiveDividendPositionYields(
  dividendTransactions: TransactionDto[],
  allTransactions: TransactionDto[],
  positions: PositionDto[],
  range: TimelineRange
): DividendPositionYield[] {
  const dividendsByPosition = new Map<
    string,
    MoneyBreakdownDto & { perShareAmount: number }
  >();
  const positionsByKey = new Map(
    positions.map((position) => [positionDividendKey(position), position])
  );

  for (const transaction of dividendTransactions) {
    const key = transactionDividendKey(transaction);
    if (!key) continue;
    const position = positionsByKey.get(key);
    if (!position) continue;

    const unitsHeld = getUnitsHeldOnDate(position, allTransactions, transaction.tradeDate);
    if (!unitsHeld) continue;

    const current = dividendsByPosition.get(key);
    const amount = Math.abs(transaction.amount.amount);
    dividendsByPosition.set(key, {
      amount: (current?.amount ?? 0) + amount,
      currency: current?.currency ?? transaction.amount.currency,
      perShareAmount: (current?.perShareAmount ?? 0) + amount / unitsHeld,
    });
  }

  const factor = annualizationFactor(range, dividendTransactions);

  const rows: Array<DividendPositionYield | null> = positions
    .filter((position) => position.units > 0 && !position.isCashEquivalent)
    .map((position) => {
      const dividends = dividendsByPosition.get(positionDividendKey(position));
      const costBasis = getPositionCostBasis(position);

      if (!dividends || dividends.amount <= 0 || costBasis <= 0) return null;

      const annualizedPerShare = dividends.perShareAmount * factor;
      const annualizedAmount = annualizedPerShare * position.units;

      return {
        id: position.id,
        symbol: position.symbol,
        description: position.description,
        accountId: position.accountId,
        units: position.units,
        accountSegments: [
          {
            accountId: position.accountId,
            dividendAmount: {
              amount: dividends.amount,
              currency: dividends.currency,
            },
          },
        ],
        dividendAmount: {
          amount: dividends.amount,
          currency: dividends.currency,
        },
        annualizedDividendAmount: {
          amount: annualizedAmount,
          currency: dividends.currency,
        },
        marketValue: position.marketValue,
        dividendPerShare: {
          amount: dividends.perShareAmount,
          currency: dividends.currency,
        },
        annualizedDividendPerShare: {
          amount: annualizedPerShare,
          currency: dividends.currency,
        },
        costBasis: {
          amount: costBasis,
          currency: position.marketValue.currency,
        },
        costPerUnit: {
          amount: costBasis / position.units,
          currency: position.marketValue.currency,
        },
        yieldOnCostPercent: (annualizedAmount / costBasis) * 100,
      };
    });

  return combineDividendYieldRows(
    rows.filter((row): row is DividendPositionYield => row != null)
  );
}
