"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "../../lib/formatters";
import type { MoneyBreakdownDto, TransactionDto } from "../../lib/portfolioTypes";
import { chartGridColor, dividendCurrencyColor } from "./chartColors";

type DividendCurrentYearChartProps = {
  transactions: TransactionDto[];
  futureMonthlyIncome: MoneyBreakdownDto[];
};

type ChartRow = {
  monthIndex: number;
  label: string;
  [key: string]: string | number;
};

const monthLabels = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function buildCurrentYearRows(
  transactions: TransactionDto[],
  futureMonthlyIncome: MoneyBreakdownDto[]
): { currencies: string[]; rows: ChartRow[] } {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const currencies = Array.from(
    new Set([
      ...transactions.map((transaction) => transaction.amount.currency),
      ...futureMonthlyIncome.map((value) => value.currency),
    ])
  ).sort();
  const futureByCurrency = new Map(
    futureMonthlyIncome.map((value) => [value.currency, Math.abs(value.amount)])
  );
  const actualByMonthCurrency = new Map<string, number>();

  for (const transaction of transactions) {
    const date = new Date(transaction.tradeDate);
    if (date.getFullYear() !== currentYear) continue;

    const key = `${date.getMonth()}:${transaction.amount.currency}`;
    actualByMonthCurrency.set(
      key,
      (actualByMonthCurrency.get(key) ?? 0) + Math.abs(transaction.amount.amount)
    );
  }

  const rows = monthLabels.map((label, monthIndex) => {
    const row: ChartRow = { monthIndex, label };

    for (const currency of currencies) {
      const actual = actualByMonthCurrency.get(`${monthIndex}:${currency}`) ?? 0;
      row[currency] =
        monthIndex <= currentMonth
          ? actual
          : futureByCurrency.get(currency) ?? 0;
    }

    return row;
  });

  return { currencies, rows };
}

export function DividendCurrentYearChart({
  transactions,
  futureMonthlyIncome,
}: DividendCurrentYearChartProps) {
  const { currencies, rows } = buildCurrentYearRows(
    transactions,
    futureMonthlyIncome
  );

  return (
    <section className="app-panel p-5">
      <div className="border-b border-border pb-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-normal text-primary-700">
          Current year
        </p>
        <h2 className="mt-1 text-lg font-semibold text-foreground">
          Current year monthly yield
        </h2>
        <p className="mt-1 text-sm text-muted">
          Received dividends through this month, with future monthly yield based on history
        </p>
      </div>

      <div className="mt-5 h-80">
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted">
            No dividend data for the current year.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 8, right: 24, top: 18, bottom: 0 }}>
              <CartesianGrid stroke={chartGridColor} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                interval={0}
                minTickGap={8}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip
                formatter={(value, name) => {
                  return [
                    formatMoney({ amount: Number(value), currency: String(name) }),
                    String(name),
                  ];
                }}
              />
              {currencies.map((currency, index) => (
                <Bar
                  key={currency}
                  dataKey={currency}
                  name={currency}
                  fill={dividendCurrencyColor(currency, index)}
                  radius={[4, 4, 0, 0]}
                  isAnimationActive
                  animationDuration={850}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}
