import { createHash } from "node:crypto";
import {
  accountBalances,
  accounts,
  and,
  eq,
  holdings as holdingsTable,
  securities,
  securityAliases,
  sql,
  transactions as transactionsTable,
  type DB,
} from "@repo/db";
import type {
  ExtractedStatementData,
  HoldingSnapshot,
  StatementTransaction,
} from "./types.js";
import { STATEMENT_SOURCE } from "./types.js";

export interface DatabaseImportOptions {
  allowErrors?: boolean;
  dryRun?: boolean;
}

export interface DatabaseImportSummary {
  dryRun: boolean;
  statements: number;
  cashBalances: number;
  holdings: number;
  transactions: number;
  warnings: number;
}

function decimal(value: number | null): string | null {
  return value == null || !Number.isFinite(value) ? null : value.toFixed(2);
}

function requiredDecimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error(`Invalid numeric value: ${value}`);
  return value.toFixed(2);
}

function utcDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

function rowsForStatement<T extends { statement_key: string }>(
  rows: T[],
  statementKey: string
): T[] {
  return rows.filter((row) => row.statement_key === statementKey);
}

function holdingImportKey(accountId: string, row: HoldingSnapshot): string {
  return createHash("sha256")
    .update([
      STATEMENT_SOURCE,
      accountId,
      row.statement_date,
      row.source_page,
      row.category,
      row.currency_code,
      row.raw_symbol,
    ].join("|"))
    .digest("hex");
}

type SecurityLookup = Map<string, string | null>;

function identityKey(symbol: string, currencyCode?: string | null): string {
  return `${symbol.trim().toUpperCase()}|${currencyCode?.trim().toUpperCase() ?? ""}`;
}

function addIdentity(
  lookup: SecurityLookup,
  symbol: string | null | undefined,
  currencyCode: string | null | undefined,
  securityId: string
): void {
  if (!symbol?.trim()) return;
  for (const key of [identityKey(symbol, currencyCode), identityKey(symbol)]) {
    const existing = lookup.get(key);
    if (existing === undefined) lookup.set(key, securityId);
    else if (existing !== securityId) lookup.set(key, null);
  }
}

function resolveSecurityId(
  lookup: SecurityLookup,
  symbol: string,
  currencyCode: string | null
): string | null {
  const exact = lookup.get(identityKey(symbol, currencyCode));
  if (exact !== undefined) return exact;
  return lookup.get(identityKey(symbol)) ?? null;
}

function statementAmount(row: StatementTransaction): number {
  return row.net_amount
    ?? row.gross_amount
    ?? row.cad_net_amount
    ?? row.usd_net_amount
    ?? 0;
}

function statementCurrency(row: StatementTransaction): string | null {
  if (row.currency_code) return row.currency_code;
  if (row.cad_net_amount != null || row.cad_gross_amount != null) return "CAD";
  if (row.usd_net_amount != null || row.usd_gross_amount != null) return "USD";
  return null;
}

function statementRawData(row: StatementTransaction): Record<string, unknown> {
  return {
    statementDate: row.statement_date,
    settlementDate: row.settlement_date,
    sourceFile: row.source_file,
    sourcePage: row.source_page,
    statementRowIndex: row.statement_row_index,
    rawActivityType: row.raw_activity_type,
    rawSymbol: row.raw_symbol,
    optionType: row.option_type,
    recordDate: row.record_date,
    paymentDate: row.payment_date,
    fxRate: row.fx_rate,
    cad: {
      price: row.cad_price,
      grossAmount: row.cad_gross_amount,
      commission: row.cad_commission,
      netAmount: row.cad_net_amount,
    },
    usd: {
      price: row.usd_price,
      grossAmount: row.usd_gross_amount,
      commission: row.usd_commission,
      netAmount: row.usd_net_amount,
    },
    rawText: row.raw_text,
  };
}

function assertImportable(
  data: ExtractedStatementData,
  allowErrors: boolean
): void {
  const statementKeys = new Set(
    data.statements.map((statement) => statement.statement_key)
  );
  const duplicateKeys = data.statements
    .map((statement) => statement.statement_key)
    .filter((key, index, keys) => keys.indexOf(key) !== index);
  if (duplicateKeys.length > 0) {
    throw new Error(
      `Duplicate statements cannot be imported: ${[...new Set(duplicateKeys)].join(", ")}`
    );
  }

  const duplicateTransactionKeys = data.transactions
    .map((transaction) => transaction.import_key)
    .filter((key, index, keys) => keys.indexOf(key) !== index);
  if (duplicateTransactionKeys.length > 0) {
    throw new Error(
      `Duplicate transaction keys cannot be imported: ${[
        ...new Set(duplicateTransactionKeys),
      ].join(", ")}`
    );
  }

  const orphanStatementKeys = [
    ...data.cashBalances,
    ...data.holdings,
    ...data.transactions,
  ]
    .map((row) => row.statement_key)
    .filter((key) => !statementKeys.has(key));
  if (orphanStatementKeys.length > 0) {
    throw new Error(
      `Extracted rows reference missing statements: ${[
        ...new Set(orphanStatementKeys),
      ].join(", ")}`
    );
  }

  const errors = data.issues.filter((issue) => issue.severity === "ERROR");
  if (!allowErrors && errors.length > 0) {
    const preview = errors
      .slice(0, 5)
      .map((issue) => `${issue.source_file}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Refusing to import ${errors.length} extraction error(s). Review the Excel output or rerun with --allow-errors.\n${preview}`
    );
  }
}

export async function saveExtractedStatements(
  db: DB,
  data: ExtractedStatementData,
  options: DatabaseImportOptions = {}
): Promise<DatabaseImportSummary> {
  assertImportable(data, options.allowErrors ?? false);

  const [accountRows, securityRows, aliasRows] = await Promise.all([
    db.select({
      id: accounts.id,
      brokerageAccountNumber: accounts.brokerageAccountNumber,
    }).from(accounts),
    db.select({
      id: securities.id,
      symbol: securities.symbol,
      rawSymbol: securities.rawSymbol,
      currencyCode: securities.currencyCode,
    }).from(securities),
    db.select({
      securityId: securityAliases.securityId,
      symbol: securityAliases.symbol,
      rawSymbol: securityAliases.rawSymbol,
      currencyCode: securityAliases.currencyCode,
    }).from(securityAliases),
  ]);

  const accountsByNumber = new Map(
    accountRows
      .filter((account) => account.brokerageAccountNumber)
      .map((account) => [account.brokerageAccountNumber as string, account.id])
  );
  const missingAccounts = [
    ...new Set(
      data.statements
        .map((statement) => statement.account_number)
        .filter((accountNumber) => !accountsByNumber.has(accountNumber))
    ),
  ];
  if (missingAccounts.length > 0) {
    throw new Error(
      `No application account matches Questrade account number(s): ${missingAccounts.join(", ")}`
    );
  }

  const securityLookup: SecurityLookup = new Map();
  for (const security of securityRows) {
    addIdentity(securityLookup, security.symbol, security.currencyCode, security.id);
    addIdentity(securityLookup, security.rawSymbol, security.currencyCode, security.id);
  }
  for (const alias of aliasRows) {
    addIdentity(securityLookup, alias.symbol, alias.currencyCode, alias.securityId);
    addIdentity(securityLookup, alias.rawSymbol, alias.currencyCode, alias.securityId);
  }

  const summary: DatabaseImportSummary = {
    dryRun: options.dryRun ?? false,
    statements: data.statements.length,
    cashBalances: data.cashBalances.length,
    holdings: data.holdings.length,
    transactions: data.transactions.length,
    warnings: data.issues.filter((issue) => issue.severity === "WARNING").length,
  };
  if (options.dryRun) return summary;

  const latestStatementByAccount = new Map<string, (typeof data.statements)[number]>();
  for (const statement of data.statements) {
    const current = latestStatementByAccount.get(statement.account_number);
    if (!current || statement.statement_date > current.statement_date) {
      latestStatementByAccount.set(statement.account_number, statement);
    }
  }

  await db.transaction(async (tx) => {
    for (const statement of data.statements) {
      const accountId = accountsByNumber.get(statement.account_number)!;
      await tx.delete(holdingsTable).where(and(
        eq(holdingsTable.accountId, accountId),
        eq(holdingsTable.asOfDate, statement.statement_date),
        eq(holdingsTable.source, STATEMENT_SOURCE)
      ));

      const holdingRows = rowsForStatement(data.holdings, statement.statement_key)
        .map((row) => {
          const resolvedSecurityId = resolveSecurityId(
            securityLookup,
            row.symbol,
            row.currency_code
          );
          const isOption = row.asset_type === "OPTION";
          return {
            accountId,
            securityId: isOption ? null : resolvedSecurityId,
            underlyingSecurityId: isOption ? resolvedSecurityId : null,
            importKey: holdingImportKey(accountId, row),
            source: STATEMENT_SOURCE,
            sourceFile: row.source_file,
            sourcePage: row.source_page,
            asOfDate: row.statement_date,
            category: row.category,
            currencyCode: row.currency_code,
            optionType: row.option_type,
            rawSymbol: row.raw_symbol,
            symbol: row.symbol,
            description: row.description,
            costBasis: row.cost_basis,
            quantity: decimal(row.quantity),
            positionCost: decimal(row.position_cost),
            marketPrice: decimal(row.market_price),
            marketValue: decimal(row.market_value),
          };
        });
      if (holdingRows.length > 0) {
        await tx.insert(holdingsTable).values(holdingRows);
      }

      const transactionRows = rowsForStatement(data.transactions, statement.statement_key)
        .map((row) => {
          const currencyCode = statementCurrency(row);
          const resolvedSecurityId = row.symbol
            ? resolveSecurityId(securityLookup, row.symbol, currencyCode)
            : null;
          const isOption = row.asset_type === "OPTION";
          return {
            snaptradeTransactionId: null,
            source: STATEMENT_SOURCE,
            externalTransactionId: row.import_key,
            legacyImportKey: `${STATEMENT_SOURCE}:${row.import_key}`,
            accountId,
            securityId: isOption ? null : resolvedSecurityId,
            underlyingSecurityId: isOption ? resolvedSecurityId : null,
            optionId: null,
            type: row.normalized_type,
            action: row.normalized_type === "BUY" || row.normalized_type === "SELL"
              ? row.normalized_type
              : null,
            optionAction: null,
            assetType: row.asset_type,
            description: row.description,
            amount: requiredDecimal(statementAmount(row)),
            price: decimal(row.price),
            units: decimal(row.quantity),
            fee: decimal(row.commission) ?? "0.00",
            currencyCode,
            symbol: row.symbol || null,
            tradeDate: utcDate(row.transaction_date),
            rawData: statementRawData(row),
          };
        });
      if (transactionRows.length > 0) {
        await tx
          .insert(transactionsTable)
          .values(transactionRows)
          .onConflictDoUpdate({
            target: [transactionsTable.legacyImportKey],
            set: {
              source: sql`excluded.source`,
              externalTransactionId: sql`excluded.external_transaction_id`,
              accountId: sql`excluded.account_id`,
              securityId: sql`excluded.security_id`,
              underlyingSecurityId: sql`excluded.underlying_security_id`,
              optionId: sql`excluded.option_id`,
              type: sql`excluded.type`,
              action: sql`excluded.action`,
              optionAction: sql`excluded.option_action`,
              assetType: sql`excluded.asset_type`,
              description: sql`excluded.description`,
              amount: sql`excluded.amount`,
              price: sql`excluded.price`,
              units: sql`excluded.units`,
              fee: sql`excluded.fee`,
              currencyCode: sql`excluded.currency_code`,
              symbol: sql`excluded.symbol`,
              tradeDate: sql`excluded.trade_date`,
              rawData: sql`excluded.raw_data`,
            },
          });
      }
    }

    for (const [accountNumber, statement] of latestStatementByAccount) {
      const accountId = accountsByNumber.get(accountNumber)!;
      const cashRows = rowsForStatement(data.cashBalances, statement.statement_key);
      for (const row of cashRows) {
        const [existing] = await tx
          .select({
            source: accountBalances.source,
            asOfDate: accountBalances.asOfDate,
          })
          .from(accountBalances)
          .where(and(
            eq(accountBalances.accountId, accountId),
            eq(accountBalances.currencyCode, row.currency_code)
          ))
          .limit(1);

        if (existing?.source !== undefined && existing.source !== STATEMENT_SOURCE) {
          continue;
        }
        if (existing?.asOfDate && existing.asOfDate > statement.statement_date) {
          continue;
        }

        await tx
          .insert(accountBalances)
          .values({
            accountId,
            currencyCode: row.currency_code,
            cash: requiredDecimal(row.total_amount),
            buyingPower: null,
            source: STATEMENT_SOURCE,
            sourceFile: statement.source_file,
            asOfDate: statement.statement_date,
            syncedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [accountBalances.accountId, accountBalances.currencyCode],
            set: {
              cash: sql`excluded.cash`,
              buyingPower: sql`excluded.buying_power`,
              source: sql`excluded.source`,
              sourceFile: sql`excluded.source_file`,
              asOfDate: sql`excluded.as_of_date`,
              syncedAt: sql`excluded.synced_at`,
            },
          });
      }
    }
  });

  return summary;
}
