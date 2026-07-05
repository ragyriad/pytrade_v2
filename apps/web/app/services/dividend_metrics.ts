import { normalizeAccountType } from "../lib/formatters";
import { absoluteMoney, divideMoney, groupMoney } from "./value_helpers";
import type {
  AccountDto,
  MoneyBreakdownDto,
  TransactionDto,
} from "../lib/portfolio-types";
import type { DividendPositionYield } from "./dividends";

export type PercentBreakdownDto = {
  currency: string;
  percent: number | null;
};

export type DividendAccountShare = {
  id: string;
  label: string;
  value: number;
  percentage: number;
  currency: string;
};

export type DividendAccountShareGroup = {
  currency: string;
  total: number;
  rows: DividendAccountShare[];
};

export type DividendIncomeMetrics = {
  totalDividends: MoneyBreakdownDto[];
  annualIncome: MoneyBreakdownDto[];
  monthlyIncome: MoneyBreakdownDto[];
  currentYieldByCurrency: PercentBreakdownDto[];
  yieldOnCostByCurrency: PercentBreakdownDto[];
};

function sortMoney(values: MoneyBreakdownDto[]): MoneyBreakdownDto[] {
  return [...values].sort(
    (a, b) => b.amount - a.amount || a.currency.localeCompare(b.currency)
  );
}

function percentByCurrency(
  rows: DividendPositionYield[],
  denominatorForRow: (row: DividendPositionYield) => MoneyBreakdownDto
): PercentBreakdownDto[] {
  const totals = new Map<string, { income: number; denominator: number }>();

  for (const row of rows) {
    const denominator = denominatorForRow(row);
    if (row.annualizedDividendAmount.currency !== denominator.currency) continue;

    const currency = denominator.currency;
    const current = totals.get(currency) ?? { income: 0, denominator: 0 };

    totals.set(currency, {
      income: current.income + row.annualizedDividendAmount.amount,
      denominator: current.denominator + denominator.amount,
    });
  }

  const results: PercentBreakdownDto[] = [];

  totals.forEach((value, currency) => {
    results.push({
      currency,
      percent:
        value.denominator > 0 ? (value.income / value.denominator) * 100 : null,
    });
  });

  return results.sort((a, b) => a.currency.localeCompare(b.currency));
}

function accountDividendLabel(account: AccountDto | undefined): string {
  if (!account) return "Unknown account";

  const accountType = account.type ? normalizeAccountType(account.type) : null;
  const brokerage = account.institutionName?.trim() || account.name.trim();

  return [accountType, brokerage].filter(Boolean).join(" ");
}

function accountNumberKey(account: AccountDto): string {
  return account.brokerageAccountNumber?.trim() || account.id;
}

function buildAccountGroupKeys(accounts: AccountDto[]): Map<string, string> {
  const parent = new Map<string, string>();

  const find = (key: string): string => {
    const current = parent.get(key) ?? key;
    if (current === key) {
      parent.set(key, key);
      return key;
    }

    const root = find(current);
    parent.set(key, root);
    return root;
  };

  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    const root = [leftRoot, rightRoot].sort()[0];
    parent.set(leftRoot, root);
    parent.set(rightRoot, root);
  };

  for (const account of accounts) {
    const accountNumber = accountNumberKey(account);
    const linkedAccountNumber = account.linkedAccountId?.trim();

    find(accountNumber);
    if (linkedAccountNumber) {
      union(accountNumber, linkedAccountNumber);
    }
  }

  return new Map(accounts.map((account) => [account.id, find(accountNumberKey(account))]));
}

export function getDividendIncomeMetrics(
  rows: DividendPositionYield[],
  transactions: TransactionDto[]
): DividendIncomeMetrics {
  const totalDividends = sortMoney(
    groupMoney(transactions.map((transaction) => absoluteMoney(transaction.amount)))
  );
  const annualIncome = sortMoney(
    groupMoney(rows.map((row) => row.annualizedDividendAmount))
  );

  return {
    totalDividends,
    annualIncome,
    monthlyIncome: sortMoney(divideMoney(annualIncome, 12)),
    currentYieldByCurrency: percentByCurrency(rows, (row) => row.marketValue),
    yieldOnCostByCurrency: percentByCurrency(rows, (row) => row.costBasis),
  };
}

export function getDividendAccountShareGroups(
  transactions: TransactionDto[],
  accounts: AccountDto[]
): DividendAccountShareGroup[] {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const accountGroupKeyById = buildAccountGroupKeys(accounts);
  const totals = new Map<
    string,
    { id: string; currency: string; label: string; value: number }
  >();

  for (const transaction of transactions) {
    const value = Math.abs(transaction.amount.amount);
    if (value === 0) continue;

    const account = accountsById.get(transaction.accountId);
    const currency = transaction.amount.currency || "USD";
    const label = accountDividendLabel(account);
    const groupKey = accountGroupKeyById.get(transaction.accountId) ?? transaction.accountId;
    const key = `${groupKey}:${currency}`;
    const current = totals.get(key);

    totals.set(key, {
      id: key,
      currency,
      label,
      value: (current?.value ?? 0) + value,
    });
  }

  const totalsByCurrency = new Map<string, number>();
  totals.forEach((row) => {
    totalsByCurrency.set(row.currency, (totalsByCurrency.get(row.currency) ?? 0) + row.value);
  });

  const groupsByCurrency = new Map<string, DividendAccountShare[]>();
  totals.forEach((row) => {
    const currencyTotal = totalsByCurrency.get(row.currency) ?? 0;
    const current = groupsByCurrency.get(row.currency) ?? [];

    groupsByCurrency.set(row.currency, [
      ...current,
      {
        id: row.id,
        label: row.label,
        value: row.value,
        percentage: currencyTotal > 0 ? (row.value / currencyTotal) * 100 : 0,
        currency: row.currency,
      },
    ]);
  });

  const groups: DividendAccountShareGroup[] = [];

  groupsByCurrency.forEach((rows, currency) => {
    groups.push({
      currency,
      total: totalsByCurrency.get(currency) ?? 0,
      rows: rows.sort((a, b) => b.value - a.value),
    });
  });

  return groups.sort((a, b) => a.currency.localeCompare(b.currency));
}
