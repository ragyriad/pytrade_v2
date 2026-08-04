export type WealthsimpleAccount = {
  id: string;
  brokerageName: string | null;
  type: string | null;
  rawType: string | null;
  snaptradeMetaType: string | null;
  snaptradeUnifiedAccountType: string | null;
  name: string | null;
};

export type WealthsimpleTransaction = {
  id: string;
  accountId: string;
  action: string | null;
  type: string;
  amount: string;
  currencyCode: string | null;
  tradeDate: Date;
  externalTransactionId?: string | null;
};

export type InvestmentTransferActionPlan = {
  sentTransactionIds: string[];
  receivedTransactionIds: string[];
};

function normalizedText(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ").trim().toUpperCase();
}

function isCreditCardAccount(account: WealthsimpleAccount): boolean {
  const types = normalizedText(
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType
  );
  return types.includes("CREDIT_CARD") || types.includes("CREDIT CARD") || normalizedText(account.name).includes("CREDIT CARD");
}

function isCashAccount(account: WealthsimpleAccount): boolean {
  if (isCreditCardAccount(account)) return false;
  const value = normalizedText(
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType,
    account.name
  );
  return value.includes("CASH") || value.includes("MSB") || value.includes("DEBIT");
}

function isInvestmentAccount(account: WealthsimpleAccount): boolean {
  if (isCashAccount(account) || isCreditCardAccount(account)) return false;
  const value = normalizedText(
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType
  );
  return !value.includes("LOAN") && !value.includes("MORTGAGE");
}

function normalizedAction(transaction: WealthsimpleTransaction): string {
  return normalizedText(transaction.action ?? transaction.type).replaceAll(" ", "_");
}

function matchKey(account: WealthsimpleAccount, transaction: WealthsimpleTransaction): string {
  const amountInCents = Math.round(Math.abs(Number(transaction.amount)) * 100);
  return [normalizedText(account.brokerageName), normalizedText(transaction.currencyCode), amountInCents].join("|");
}

function hasSameExternalReference(sent: WealthsimpleTransaction, received: WealthsimpleTransaction): boolean {
  return Boolean(sent.externalTransactionId && received.externalTransactionId && sent.externalTransactionId === received.externalTransactionId);
}

const MAX_REFERENCED_TRANSFER_GAP_MS = 24 * 60 * 60 * 1_000;
const MAX_UNREFERENCED_TRANSFER_GAP_MS = 60 * 1_000;

/** Matches only unambiguous cash withdrawals with investment deposits. */
export function planSnaptradeInvestmentTransferActions(
  accountRows: WealthsimpleAccount[],
  transactionRows: WealthsimpleTransaction[]
): InvestmentTransferActionPlan {
  const accountsById = new Map(accountRows.map((account) => [account.id, account]));
  const sentByKey = new Map<string, WealthsimpleTransaction[]>();
  const receivedByKey = new Map<string, WealthsimpleTransaction[]>();

  for (const transaction of transactionRows) {
    const account = accountsById.get(transaction.accountId);
    if (!account || !normalizedText(account.brokerageName).includes("WEALTHSIMPLE")) continue;
    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const key = matchKey(account, transaction);
    if (isCashAccount(account) && amount < 0 && ["WITHDRAWAL", "TRANSFER", "TRANSFER_OUT"].includes(normalizedAction(transaction))) {
      const rows = sentByKey.get(key) ?? [];
      rows.push(transaction);
      sentByKey.set(key, rows);
    }
    if (isInvestmentAccount(account) && amount > 0 && ["DEPOSIT", "CONTRIBUTION", "TRANSFER", "TRANSFER_IN"].includes(normalizedAction(transaction))) {
      const rows = receivedByKey.get(key) ?? [];
      rows.push(transaction);
      receivedByKey.set(key, rows);
    }
  }

  const sentTransactionIds: string[] = [];
  const receivedTransactionIds: string[] = [];
  for (const [key, sentRows] of sentByKey) {
    const availableReceivedRows = [...(receivedByKey.get(key) ?? [])];
    for (const sentRow of sentRows) {
      const eligible = availableReceivedRows
        .map((receivedRow, index) => ({
          receivedRow,
          index,
          gap: Math.abs(receivedRow.tradeDate.getTime() - sentRow.tradeDate.getTime()),
          sharedReference: hasSameExternalReference(sentRow, receivedRow),
        }))
        .filter(({ gap, sharedReference }) => gap <= (sharedReference ? MAX_REFERENCED_TRANSFER_GAP_MS : MAX_UNREFERENCED_TRANSFER_GAP_MS))
        .sort((left, right) => left.gap - right.gap);
      if (eligible.length !== 1) continue;
      sentTransactionIds.push(sentRow.id);
      receivedTransactionIds.push(eligible[0].receivedRow.id);
      availableReceivedRows.splice(eligible[0].index, 1);
    }
  }
  return { sentTransactionIds, receivedTransactionIds };
}
