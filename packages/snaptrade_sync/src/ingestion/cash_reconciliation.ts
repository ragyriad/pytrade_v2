import { sql, transactions, type DB } from "@repo/db";

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
