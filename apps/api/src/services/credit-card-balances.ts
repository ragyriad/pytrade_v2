import type { MoneyBreakdownDto, MoneyDto } from "../shared/money.js";

export type CreditCardBalanceAccountInput = {
  id: string;
  institutionName: string | null;
  accountCurrency: string | null;
  status: string | null;
  category: "cash" | "credit";
  balances: MoneyDto[];
  creditLimit?: MoneyDto | null;
};

export type CreditCardBalanceTransactionInput = {
  id: string;
  accountId: string;
  action: string | null;
  type: string;
  amount: MoneyDto;
  tradeDate: string;
  isArchived: boolean;
};

export type CalculatedCreditCardBalance = {
  accountId: string;
  currency: string;
  netAmount: number;
  amountOwing: number;
  creditAmount: number;
  creditLimit: number | null;
  charges: number;
  returns: number;
  payments: number;
  status: "owing" | "credit" | "paid";
  calculatedThrough: string | null;
  firstActivityDate: string | null;
};

export type CreditCardBalanceCalculation = {
  balances: CalculatedCreditCardBalance[];
  unallocatedPayments: MoneyBreakdownDto[];
  sentPaymentTransactionIds: string[];
  receivedPaymentTransactionIds: string[];
};

type BalanceAccumulator = {
  accountId: string;
  currency: string;
  charges: number;
  returns: number;
  payments: number;
  activity: number;
  calculatedThrough: string | null;
  firstActivityDate: string | null;
};

function normalized(value: string | null | undefined): string {
  return value?.trim().toUpperCase() ?? "";
}

function isClosed(account: CreditCardBalanceAccountInput): boolean {
  return ["CLOSED", "INACTIVE", "DEACTIVATED"].includes(
    normalized(account.status)
  );
}

function isPayment(transaction: CreditCardBalanceTransactionInput): boolean {
  return normalized(transaction.action ?? transaction.type).includes(
    "CREDIT_CARD_PAYMENT"
  );
}

function isReturn(transaction: CreditCardBalanceTransactionInput): boolean {
  const action = normalized(transaction.action ?? transaction.type);
  return ["REFUND", "REIMBURSEMENT", "REVERSAL", "CASHBACK", "INTEREST"].some((term) =>
    action.includes(term)
  );
}

function isCharge(transaction: CreditCardBalanceTransactionInput): boolean {
  const action = normalized(transaction.action ?? transaction.type);
  return ["SPEND", "PURCHASE", "CHARGE", "DEBIT", "FEE"].some(
    (term) => action.includes(term)
  );
}

function updateActivityDates(
  accumulator: BalanceAccumulator,
  tradeDate: string
): void {
  const tradeTime = new Date(tradeDate).getTime();
  if (!Number.isFinite(tradeTime)) return;

  const firstTime = accumulator.firstActivityDate
    ? new Date(accumulator.firstActivityDate).getTime()
    : Number.POSITIVE_INFINITY;
  const latestTime = accumulator.calculatedThrough
    ? new Date(accumulator.calculatedThrough).getTime()
    : Number.NEGATIVE_INFINITY;

  if (tradeTime < firstTime) accumulator.firstActivityDate = tradeDate;
  if (tradeTime > latestTime) accumulator.calculatedThrough = tradeDate;
}

function groupMoney(
  values: Array<{ amount: number; currency: string }>
): MoneyBreakdownDto[] {
  const totals = new Map<string, number>();

  for (const value of values) {
    totals.set(value.currency, (totals.get(value.currency) ?? 0) + value.amount);
  }

  return Array.from(totals.entries())
    .map(([currency, amount]) => ({ currency, amount }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function accountCurrencies(
  account: CreditCardBalanceAccountInput
): string[] {
  const currencies = new Set(
    account.balances.map((balance) => balance.currency).filter(Boolean)
  );
  if (account.accountCurrency) currencies.add(account.accountCurrency);
  return [...currencies];
}

function balanceKey(accountId: string, currency: string): string {
  return `${accountId}:${currency}`;
}

function transferKey(
  account: CreditCardBalanceAccountInput,
  transaction: CreditCardBalanceTransactionInput
): string {
  return [
    normalized(account.institutionName),
    transaction.amount.currency,
    Math.round(Math.abs(transaction.amount.amount) * 100),
  ].join("|");
}

function inferPaymentPairs(
  accountsById: Map<string, CreditCardBalanceAccountInput>,
  transactions: CreditCardBalanceTransactionInput[]
): { sentIds: Set<string>; receivedIds: Set<string> } {
  const sentByKey = new Map<string, CreditCardBalanceTransactionInput[]>();
  const receivedByKey = new Map<string, CreditCardBalanceTransactionInput[]>();

  for (const transaction of transactions) {
    if (transaction.isArchived) continue;
    const account = accountsById.get(transaction.accountId);
    if (!account || !normalized(account.institutionName).includes("WEALTHSIMPLE")) {
      continue;
    }
    const action = normalized(transaction.action ?? transaction.type);
    const eligible = action.includes("SPEND") || isPayment(transaction);
    if (!eligible) continue;

    const key = transferKey(account, transaction);
    if (
      account.category === "cash" &&
      (isPayment(transaction) || transaction.amount.amount < 0)
    ) {
      const rows = sentByKey.get(key) ?? [];
      rows.push(transaction);
      sentByKey.set(key, rows);
    } else if (account.category === "credit" && transaction.amount.amount > 0) {
      const rows = receivedByKey.get(key) ?? [];
      rows.push(transaction);
      receivedByKey.set(key, rows);
    }
  }

  const sentIds = new Set<string>();
  const receivedIds = new Set<string>();
  for (const [key, sentRows] of sentByKey) {
    const availableReceivedRows = [...(receivedByKey.get(key) ?? [])];
    for (const sentRow of sentRows) {
      let matchIndex = -1;
      let closestGap = Number.POSITIVE_INFINITY;
      for (let index = 0; index < availableReceivedRows.length; index += 1) {
        const gap = Math.abs(
          new Date(availableReceivedRows[index].tradeDate).getTime() -
            new Date(sentRow.tradeDate).getTime()
        );
        if (gap < 1_000 && gap < closestGap) {
          matchIndex = index;
          closestGap = gap;
        }
      }
      if (matchIndex >= 0) {
        sentIds.add(sentRow.id);
        receivedIds.add(availableReceivedRows[matchIndex].id);
        availableReceivedRows.splice(matchIndex, 1);
      }
    }
  }
  return { sentIds, receivedIds };
}

function paymentCandidates(
  paymentAccount: CreditCardBalanceAccountInput | undefined,
  currency: string,
  creditAccounts: CreditCardBalanceAccountInput[]
): CreditCardBalanceAccountInput[] {
  const openCurrencyMatches = creditAccounts.filter(
    (account) =>
      !isClosed(account) && accountCurrencies(account).includes(currency)
  );
  const institution = normalized(paymentAccount?.institutionName);
  const institutionMatches = institution
    ? openCurrencyMatches.filter(
        (account) => normalized(account.institutionName) === institution
      )
    : [];

  if (institutionMatches.length === 1) return institutionMatches;
  return openCurrencyMatches.length === 1 ? openCurrencyMatches : [];
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateCreditCardBalances(
  accounts: CreditCardBalanceAccountInput[],
  transactions: CreditCardBalanceTransactionInput[]
): CreditCardBalanceCalculation {
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const inferredPayments = inferPaymentPairs(accountsById, transactions);
  const sentPaymentTransactionIds = new Set(inferredPayments.sentIds);
  const receivedPaymentTransactionIds = new Set(inferredPayments.receivedIds);
  for (const transaction of transactions) {
    if (!isPayment(transaction)) continue;
    const account = accountsById.get(transaction.accountId);
    if (account?.category === "credit") {
      receivedPaymentTransactionIds.add(transaction.id);
    } else if (account?.category === "cash") {
      sentPaymentTransactionIds.add(transaction.id);
    }
  }
  const creditAccounts = accounts.filter(
    (account) => account.category === "credit"
  );
  const accumulators = new Map<string, BalanceAccumulator>();
  const unallocatedPayments: Array<{ amount: number; currency: string }> = [];

  for (const account of creditAccounts) {
    for (const currency of accountCurrencies(account)) {
      accumulators.set(balanceKey(account.id, currency), {
        accountId: account.id,
        currency,
        charges: 0,
        returns: 0,
        payments: 0,
        activity: 0,
        calculatedThrough: null,
        firstActivityDate: null,
      });
    }
  }

  for (const transaction of transactions) {
    if (transaction.isArchived) continue;
    const account = accountsById.get(transaction.accountId);
    if (account?.category !== "credit") continue;

    const key = balanceKey(account.id, transaction.amount.currency);
    const accumulator = accumulators.get(key);
    if (!accumulator) continue;
    const amount = transaction.amount.amount;

    if (isPayment(transaction) || inferredPayments.receivedIds.has(transaction.id)) {
      accumulator.payments += Math.abs(amount);
      accumulator.activity += Math.abs(amount);
    } else if (isReturn(transaction)) {
      accumulator.returns += Math.abs(amount);
      accumulator.activity += Math.abs(amount);
    } else if (isCharge(transaction)) {
      accumulator.charges += Math.abs(amount);
      accumulator.activity -= Math.abs(amount);
    } else {
      continue;
    }

    updateActivityDates(accumulator, transaction.tradeDate);
  }

  for (const transaction of transactions) {
    if (
      transaction.isArchived ||
      (!isPayment(transaction) && !inferredPayments.sentIds.has(transaction.id))
    ) {
      continue;
    }
    const paymentAccount = accountsById.get(transaction.accountId);
    if (paymentAccount?.category === "credit") continue;
    if (inferredPayments.sentIds.has(transaction.id)) continue;

    const candidates = paymentCandidates(
      paymentAccount,
      transaction.amount.currency,
      creditAccounts
    );

    if (candidates.length !== 1) {
      unallocatedPayments.push({
        amount: Math.abs(transaction.amount.amount),
        currency: transaction.amount.currency,
      });
      continue;
    }

    const accumulator = accumulators.get(
      balanceKey(candidates[0].id, transaction.amount.currency)
    );
    if (!accumulator) continue;

    const payment = Math.abs(transaction.amount.amount);
    accumulator.payments += payment;
    accumulator.activity += payment;
    updateActivityDates(accumulator, transaction.tradeDate);
  }

  const balances = Array.from(accumulators.values())
    .map((accumulator): CalculatedCreditCardBalance => {
      const netAmount = roundMoney(accumulator.activity);
      const amountOwing = roundMoney(Math.max(-netAmount, 0));
      const creditAmount = roundMoney(Math.max(netAmount, 0));
      const account = accountsById.get(accumulator.accountId);
      const creditLimit =
        account?.creditLimit?.currency === accumulator.currency
          ? roundMoney(account.creditLimit.amount)
          : null;

      return {
        accountId: accumulator.accountId,
        currency: accumulator.currency,
        netAmount,
        amountOwing,
        creditAmount,
        creditLimit,
        charges: roundMoney(accumulator.charges),
        returns: roundMoney(accumulator.returns),
        payments: roundMoney(accumulator.payments),
        status:
          amountOwing > 0 ? "owing" : creditAmount > 0 ? "credit" : "paid",
        calculatedThrough: accumulator.calculatedThrough,
        firstActivityDate: accumulator.firstActivityDate,
      };
    })
    .sort(
      (a, b) =>
        a.accountId.localeCompare(b.accountId) ||
        a.currency.localeCompare(b.currency)
    );

  return {
    balances,
    unallocatedPayments: groupMoney(unallocatedPayments),
    sentPaymentTransactionIds: [...sentPaymentTransactionIds],
    receivedPaymentTransactionIds: [...receivedPaymentTransactionIds],
  };
}
