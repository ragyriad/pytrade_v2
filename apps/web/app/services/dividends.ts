import { absoluteMoney, divideMoney, groupMoney } from "./value_helpers";
import { annualizationFactor, getMonthDivisor, type TimelineRange } from "./filter_timeline";
import { getCurrentCostBasis } from "./portfolio";
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
  costBasis: MoneyBreakdownDto;
  costPerUnit: MoneyBreakdownDto;
  dividendPerShare: MoneyBreakdownDto;
  annualizedDividendPerShare: MoneyBreakdownDto;
  yieldPercent: number;
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
  const costBasis = getCurrentCostBasis(positions);
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

function getSignedUnitChange(transaction: TransactionDto): number {
  if (transaction.units == null) return 0;

  const type = transaction.type.toUpperCase();
  if (type.includes("BUY")) return Math.abs(transaction.units);
  if (type.includes("SELL")) return -Math.abs(transaction.units);

  return 0;
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
      yieldPercent: costBasis > 0 ? (annualizedAmount / costBasis) * 100 : 0,
    });
  }

  return Array.from(rowsBySymbol.values()).sort(
    (a, b) => b.dividendAmount.amount - a.dividendAmount.amount
  );
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
        yieldPercent: (annualizedAmount / costBasis) * 100,
      };
    });

  return combineDividendYieldRows(
    rows.filter((row): row is DividendPositionYield => row != null)
  );
}
