import {
  accounts,
  and,
  eq,
  inArray,
  sql,
  transactions,
  type DB,
} from "@repo/db";

type PaymentAccount = {
  id: string;
  brokerageName: string | null;
  type: string | null;
  rawType: string | null;
  snaptradeMetaType: string | null;
  snaptradeUnifiedAccountType: string | null;
  name: string | null;
};

type PaymentTransaction = {
  id: string;
  accountId: string;
  action: string | null;
  type: string;
  amount: string;
  currencyCode: string | null;
  tradeDate: Date;
};

export type CreditCardPaymentActionPlan = {
  sentTransactionIds: string[];
  receivedTransactionIds: string[];
};

function normalizedText(...values: Array<string | null | undefined>): string {
  return values.filter(Boolean).join(" ").trim().toUpperCase();
}

function isCreditCardAccount(account: PaymentAccount): boolean {
  const types = normalizedText(
    account.type,
    account.rawType,
    account.snaptradeMetaType,
    account.snaptradeUnifiedAccountType
  );
  const name = normalizedText(account.name);
  return (
    types.includes("CREDIT_CARD") ||
    types.includes("CREDIT CARD") ||
    name.includes("CREDIT CARD")
  );
}

function isCashAccount(account: PaymentAccount): boolean {
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

function normalizedAction(transaction: PaymentTransaction): string {
  return normalizedText(transaction.action ?? transaction.type).replaceAll(" ", "_");
}

function paymentMatchKey(
  account: PaymentAccount,
  transaction: PaymentTransaction
): string {
  const amountInCents = Math.round(Math.abs(Number(transaction.amount)) * 100);
  return [
    normalizedText(account.brokerageName),
    normalizedText(transaction.currencyCode),
    amountInCents,
  ].join("|");
}

/**
 * Matches exact, opposite-signed transfers from a Wealthsimple cash account to
 * its credit-card account. Currency, amount, brokerage, and timestamps within
 * one second are required so ordinary card purchases cannot be relabeled.
 */
export function planSnaptradeCreditCardPaymentActions(
  accountRows: PaymentAccount[],
  transactionRows: PaymentTransaction[]
): CreditCardPaymentActionPlan {
  const accountsById = new Map(accountRows.map((account) => [account.id, account]));
  const sentByKey = new Map<string, PaymentTransaction[]>();
  const receivedByKey = new Map<string, PaymentTransaction[]>();

  for (const transaction of transactionRows) {
    const account = accountsById.get(transaction.accountId);
    if (!account || !normalizedText(account.brokerageName).includes("WEALTHSIMPLE")) {
      continue;
    }

    const amount = Number(transaction.amount);
    if (!Number.isFinite(amount) || amount === 0) continue;
    const action = normalizedAction(transaction);
    const key = paymentMatchKey(account, transaction);

    if (
      isCashAccount(account) &&
      (
        action === "CREDIT_CARD_PAYMENT" ||
        action === "CREDIT_CARD_PAYMENT_SENT" ||
        (action === "SPEND" && amount < 0)
      )
    ) {
      const rows = sentByKey.get(key) ?? [];
      rows.push(transaction);
      sentByKey.set(key, rows);
    }

    if (
      isCreditCardAccount(account) &&
      amount > 0 &&
      ["SPEND", "CREDIT_CARD_PAYMENT", "CREDIT_CARD_PAYMENT_RECEIVED"].includes(action)
    ) {
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
      let matchIndex = -1;
      let closestGap = Number.POSITIVE_INFINITY;
      for (let index = 0; index < availableReceivedRows.length; index += 1) {
        const gap = Math.abs(
          availableReceivedRows[index].tradeDate.getTime() -
            sentRow.tradeDate.getTime()
        );
        if (gap < 1_000 && gap < closestGap) {
          matchIndex = index;
          closestGap = gap;
        }
      }
      if (matchIndex >= 0) {
        sentTransactionIds.push(sentRow.id);
        receivedTransactionIds.push(availableReceivedRows[matchIndex].id);
        availableReceivedRows.splice(matchIndex, 1);
      }
    }
  }

  return { sentTransactionIds, receivedTransactionIds };
}

/**
 * Repairs historical SnapTrade rows after an account is positively identified
 * as Wealthsimple cash-like. This source-specific operation intentionally lives
 * with SnapTrade ingestion, not in the generic database package.
 */
export async function normalizeSnaptradeCashTransactions(
  db: DB,
  accountId: string
): Promise<number> {
  const normalized = await db.execute(sql`
    with classified as (
      select
        ${transactions.id} as id,
        case
          when upper(replace(
            coalesce(
              ${transactions.rawData} ->> 'type',
              ${transactions.action},
              ${transactions.type}
            ),
            '_',
            ' '
          )) = 'CREDIT CARD'
            then 'SPEND'
          when upper(replace(
            coalesce(
              ${transactions.rawData} ->> 'type',
              ${transactions.action},
              ${transactions.type}
            ),
            '_',
            ' '
          )) = 'CREDIT CARD PAYMENT'
            then 'CREDIT_CARD_PAYMENT'
          when upper(replace(
            coalesce(
              ${transactions.rawData} ->> 'type',
              ${transactions.action},
              ${transactions.type}
            ),
            '_',
            ' '
          )) = 'P2P PAYMENT'
            then 'P2P_PAYMENT'
          when upper(coalesce(
            ${transactions.rawData} ->> 'type',
            ${transactions.action},
            ${transactions.type}
          )) = 'CONTRIBUTION'
            then 'DEPOSIT'
          when upper(coalesce(
            ${transactions.rawData} ->> 'type',
            ${transactions.action},
            ${transactions.type}
          )) = 'REFUND'
            then 'REIMBURSEMENT'
          else coalesce(
            ${transactions.action},
            ${transactions.rawData} ->> 'type',
            ${transactions.type}
          )
        end as normalized_action
      from ${transactions}
      where ${transactions.accountId} = ${accountId}
        and ${transactions.snaptradeTransactionId} is not null
    )
    update ${transactions} as target
    set
      "type" = 'CASH',
      "action" = classified.normalized_action,
      "asset_type" = 'CASH',
      "security_id" = null,
      "underlying_security_id" = null,
      "option_id" = null,
      "option_action" = null,
      "symbol" = null
    from classified
    where target.id = classified.id
      and (
        target.type is distinct from 'CASH'
        or target.action is distinct from classified.normalized_action
        or target.asset_type is distinct from 'CASH'
        or target.security_id is not null
        or target.underlying_security_id is not null
        or target.option_id is not null
        or target.option_action is not null
        or target.symbol is not null
      )
    returning target.id
  `);

  return normalized.length;
}

/**
 * Reconciles payment pairs across a user's Wealthsimple cash and credit-card
 * accounts after per-account ingestion has completed.
 */
export async function normalizeSnaptradeCreditCardPayments(
  db: DB,
  syncedAccountId: string
): Promise<number> {
  const ownerRows = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(eq(accounts.id, syncedAccountId))
    .limit(1);
  const userId = ownerRows[0]?.userId;
  if (!userId) return 0;

  const accountRows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId));
  const accountIds = accountRows.map((account) => account.id);
  if (accountIds.length === 0) return 0;

  const transactionRows = await db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      action: transactions.action,
      type: transactions.type,
      amount: transactions.amount,
      currencyCode: transactions.currencyCode,
      tradeDate: transactions.tradeDate,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.accountId, accountIds),
        eq(transactions.source, "SNAPTRADE"),
        eq(transactions.isArchived, false)
      )
    );
  const plan = planSnaptradeCreditCardPaymentActions(accountRows, transactionRows);

  let updated = 0;
  if (plan.sentTransactionIds.length > 0) {
    const rows = await db
      .update(transactions)
      .set({ action: "CREDIT_CARD_PAYMENT_SENT" })
      .where(inArray(transactions.id, plan.sentTransactionIds))
      .returning({ id: transactions.id });
    updated += rows.length;
  }
  if (plan.receivedTransactionIds.length > 0) {
    const rows = await db
      .update(transactions)
      .set({ action: "CREDIT_CARD_PAYMENT_RECEIVED" })
      .where(inArray(transactions.id, plan.receivedTransactionIds))
      .returning({ id: transactions.id });
    updated += rows.length;
  }

  return updated;
}
