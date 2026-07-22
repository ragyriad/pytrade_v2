import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { extractPdfPages, type ExtractedPdfPage, type PdfLine, type PdfToken } from "./pdf.js";
import {
  STATEMENT_SOURCE,
  type AssetCategory,
  type CashBalanceSnapshot,
  type CurrencyCode,
  type ExtractedStatementData,
  type HoldingSnapshot,
  type ImportIssue,
  type StatementSnapshot,
  type StatementTransaction,
} from "./types.js";

const DATE_FORMAT = /^(\d{2})-(\d{2})-(\d{4})$/;
const MONEY_TOKEN = /^(?:[-—]|\(?-?\$?[\d,]+(?:\.\d+)?\)?[A-Za-z]?)$/;
const COST_BASES = new Set(["BK", "HMV", "HMVD", "ND"]);
const BALANCE_CATEGORIES: Array<{ label: RegExp; category: AssetCategory }> = [
  { label: /^Cash\b/i, category: "CASH" },
  { label: /^Stocks\b/i, category: "STOCK" },
  { label: /^Exchange(?:-| )traded funds\b/i, category: "ETF" },
  { label: /^American depository receipts\b/i, category: "ADR" },
  { label: /^Options\b/i, category: "OPTION" },
];

interface StatementContext {
  sourceFile: string;
  accountNumber: string;
  accountType: string;
  statementDate: string;
  statementKey: string;
  fxRate: number | null;
}

interface ParsedBalanceCategory {
  category: AssetCategory;
  owned_value_cad: number;
  borrowed_value_cad: number;
  total_value_cad: number;
}

function emptyData(): ExtractedStatementData {
  return {
    statements: [],
    cashBalances: [],
    holdings: [],
    transactions: [],
    issues: [],
  };
}

function addIssue(
  issues: ImportIssue[],
  context: Partial<StatementContext>,
  severity: "ERROR" | "WARNING",
  entity: string,
  message: string,
  sourcePage: number | null = null,
  rawText = "",
): void {
  issues.push({
    severity,
    source_file: context.sourceFile ?? "",
    source_page: sourcePage,
    statement_key: context.statementKey ?? "",
    entity,
    message,
    raw_text: rawText,
  });
}

function parseNumber(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed === "-" || trimmed === "—") return null;
  const negative = trimmed.startsWith("(") && trimmed.endsWith(")");
  const normalized = trimmed
    .replace(/[(),$]/g, "")
    .replace(/[A-Za-z]$/g, "")
    .replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  return round2(negative ? -Math.abs(number) : number);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function isoDate(value: string): string {
  const match = value.match(DATE_FORMAT);
  if (!match) return "";
  return `${match[3]}-${match[1]}-${match[2]}`;
}

function parseLongDate(month: string, day: string, year: string): string {
  const value = new Date(`${month} ${day.replace(",", "")}, ${year} 12:00:00 UTC`);
  return Number.isNaN(value.valueOf()) ? "" : value.toISOString().slice(0, 10);
}

function center(token: PdfToken): number {
  return token.x + token.width / 2;
}

function tokensBetween(line: PdfLine, minX: number, maxX: number): PdfToken[] {
  return line.tokens.filter((token) => center(token) >= minX && center(token) < maxX);
}

function textBetween(line: PdfLine, minX: number, maxX: number): string {
  return tokensBetween(line, minX, maxX).map((token) => token.text).join(" ").trim();
}

function numericBetween(line: PdfLine, minX: number, maxX: number): number | null {
  const candidates = tokensBetween(line, minX, maxX).filter((token) => MONEY_TOKEN.test(token.text));
  return parseNumber(candidates.at(-1)?.text);
}

function valueNearX(line: PdfLine, targetX: number, tolerance = 35, dashAsZero = false): number | null {
  const candidates = line.tokens
    .filter((token) => MONEY_TOKEN.test(token.text))
    .map((token) => ({ token, distance: Math.abs(center(token) - targetX) }))
    .filter(({ distance }) => distance <= tolerance)
    .sort((a, b) => a.distance - b.distance);
  const value = candidates[0]?.token.text;
  if (dashAsZero && (value === "-" || value === "—")) return 0;
  return parseNumber(value);
}

function orderedValues(line: PdfLine, maxX = 600, dashAsZero = false): Array<number | null> {
  return line.tokens
    .filter((token) => center(token) < maxX && MONEY_TOKEN.test(token.text))
    .map((token) => {
      if (dashAsZero && (token.text === "-" || token.text === "—")) return 0;
      return parseNumber(token.text);
    });
}

function normalizeType(activityType: string, description: string): string {
  const value = `${activityType} ${description}`.toUpperCase();
  if (/\bSELL\b/.test(value)) return "SELL";
  if (/\bBUY\b/.test(value)) return "BUY";
  if (/\b(DIV|DIS|DIST)\b/.test(value)) return "DIVIDEND";
  if (/\b(INT|INTEREST)\b/.test(value)) return "INTEREST";
  if (/TRANSFER[ -]?IN/.test(value)) return "TRANSFER_IN";
  if (/TRANSFER[ -]?OUT/.test(value)) return "TRANSFER_OUT";
  if (/\b(DEP|DEPOSIT|CONTRIBUTION)\b/.test(value)) return "CONTRIBUTION";
  if (/\b(WDL|WITHDRAWAL)\b/.test(value)) return "WITHDRAWAL";
  if (/NON-RES(?:IDENT)? TAX|WITHHOLD(?:ING|HELD)/.test(value)) return "WITHHOLDING_TAX";
  if (/\b(FEE|REBATE|ADR|HST)\b|HARMONIZED SALES TAX/.test(value)) return "FEE";
  if (/\bFXT\b|FX CONVERSION|FOREIGN EXCHANGE|CONVERSION - (?:CAD\/USD|USD\/CAD)/.test(value)) return "FX_CONVERSION";
  if (/\b(EXP|EXE|ASN|MGR)\b/.test(value)) return "CORPORATE_ACTION";
  if (/\bREV\b/.test(value)) return "REVERSAL";
  return "OTHER";
}

function inferActivityType(rawActivityType: string, description: string): string {
  const raw = rawActivityType.trim();
  if (raw) return raw;
  const value = description.toUpperCase();
  if (/\bDIST\b/.test(value)) return "DIST";
  if (/NON-RES(?:IDENT)? TAX|WITHHOLD(?:ING|HELD)/.test(value)) return "WITHHOLDING TAX";
  return "";
}

function taggedDescriptionDate(description: string, tag: "REC" | "PAY"): string | null {
  const match = description.match(new RegExp(`\\b${tag}(?:ORD|ORD DATE|MENT|MENT DATE)?\\s+(\\d{1,2})/(\\d{1,2})/(\\d{2}|\\d{4})\\b`, "i"));
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const month = Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function optionIdentity(description: string): { optionType: "PUT" | "CALL"; symbol: string } | null {
  const match = description.trim().match(/^(PUT|CALL)\s+([A-Z][A-Z0-9.-]*)\b/i);
  if (!match) return null;
  return {
    optionType: match[1].toUpperCase() as "PUT" | "CALL",
    symbol: match[2].replace(/^\./, "").toUpperCase(),
  };
}

function makeImportKey(row: Omit<StatementTransaction, "import_key">): string {
  const identity = [
    row.account_number,
    row.statement_key,
    row.source_page,
    row.statement_row_index,
    row.transaction_date,
    row.settlement_date,
    row.activity_type,
    row.symbol,
    row.description,
    row.fx_rate,
    row.quantity,
    row.cad_price,
    row.cad_gross_amount,
    row.cad_commission,
    row.cad_net_amount,
    row.usd_price,
    row.usd_gross_amount,
    row.usd_commission,
    row.usd_net_amount,
  ].join("|");
  return createHash("sha256").update(identity).digest("hex");
}

function contextFromPages(pdfPath: string, pages: ExtractedPdfPage[], issues: ImportIssue[]): StatementContext | null {
  const sourceFile = path.basename(pdfPath);
  const allText = pages.map((page) => page.text).join("\n");
  const accountMatch = allText.match(/Account\s*(?:#\s*)?:\s*(\d+)/i);
  const dateMatch = allText.match(/Current month:\s*([A-Za-z]+)\s+(\d{1,2},)\s+(\d{4})/i);
  const fxMatch = allText.match(/Current month FX rate:\s*\$?1\.00\s*USD\s*=\s*\$?\s*([\d.]+)\s*CAD/i);
  const accountTypeMatch = allText.match(/\b(TFSA|RRSP) summary\b/i);
  const accountNumber = accountMatch?.[1] ?? "";
  const statementDate = dateMatch ? parseLongDate(dateMatch[1], dateMatch[2], dateMatch[3]) : "";
  const accountType = (accountTypeMatch?.[1] ?? path.basename(path.dirname(pdfPath))).toUpperCase();
  const partial = { sourceFile };

  if (!accountNumber) addIssue(issues, partial, "ERROR", "statement", "Account number was not found.");
  if (!statementDate) addIssue(issues, partial, "ERROR", "statement", "Statement as-of date was not found.");
  if (!accountType) addIssue(issues, partial, "ERROR", "statement", "Account type was not found.");
  if (!accountNumber || !statementDate || !accountType) return null;

  const statementKey = `${accountNumber}:${statementDate}`;
  const context: StatementContext = {
    sourceFile,
    accountNumber,
    accountType,
    statementDate,
    statementKey,
    fxRate: parseNumber(fxMatch?.[1]),
  };
  if (context.fxRate == null) addIssue(issues, context, "WARNING", "statement", "Current USD/CAD FX rate was not found.");
  return context;
}

function baseRow(context: StatementContext) {
  return {
    statement_key: context.statementKey,
    source: STATEMENT_SOURCE,
    source_file: context.sourceFile,
    account_number: context.accountNumber,
    account_type: context.accountType,
    statement_date: context.statementDate,
  } as const;
}

function parseBalances(
  page: ExtractedPdfPage,
): { categories: ParsedBalanceCategory[]; totals: Pick<StatementSnapshot, "owned_balance_cad" | "borrowed_balance_cad" | "total_balance_cad"> } {
  const categories: ParsedBalanceCategory[] = [];
  for (const definition of BALANCE_CATEGORIES) {
    const line = page.lines.find((candidate) =>
      definition.label.test(candidate.text.replace(/^[■•]\s*/, ""))
      && candidate.tokens.filter((token) => center(token) < 600 && MONEY_TOKEN.test(token.text)).length >= 3,
    );
    categories.push({
      category: definition.category,
      owned_value_cad: line ? orderedValues(line, 600, true)[0] ?? 0 : 0,
      borrowed_value_cad: line ? orderedValues(line, 600, true)[1] ?? 0 : 0,
      total_value_cad: line ? orderedValues(line, 600, true)[2] ?? 0 : 0,
    });
  }

  const totalLine = page.lines.find((line) => {
    const main = line.tokens.filter((token) => center(token) < 600);
    return !/[A-Za-z]/.test(main.map((token) => token.text).join("")) && main.filter((token) => MONEY_TOKEN.test(token.text)).length >= 3;
  });
  return {
    categories,
    totals: {
      owned_balance_cad: totalLine ? orderedValues(totalLine, 600, true)[0] ?? null : null,
      borrowed_balance_cad: totalLine ? orderedValues(totalLine, 600, true)[1] ?? null : null,
      total_balance_cad: totalLine ? orderedValues(totalLine, 600, true)[2] ?? null : null,
    },
  };
}

function parseBookCost(page: ExtractedPdfPage): Pick<
  StatementSnapshot,
  "total_market_value_cad" | "total_position_cost_cad" | "total_cash_cad" | "total_book_value_cad"
> {
  const marketLine = page.lines.find((line) => /Total Market Value/i.test(line.text));
  const cashLine = page.lines.find((line) => /^Total Cash\b/i.test(line.text));
  const totalLine = page.lines.find((line) => /^Total\s+(?:[-—(\d])/i.test(line.text));
  const marketValues = marketLine ? orderedValues(marketLine, 600, true) : [];
  const cashValues = cashLine ? orderedValues(cashLine, 600, true) : [];
  const totalValues = totalLine ? orderedValues(totalLine, 600, true) : [];
  return {
    total_market_value_cad: marketValues[0] ?? null,
    total_position_cost_cad: marketValues[2] ?? null,
    total_cash_cad: cashValues[0] ?? null,
    total_book_value_cad: totalValues[2] ?? null,
  };
}

function parseCash(context: StatementContext, page: ExtractedPdfPage): CashBalanceSnapshot[] {
  const ownedLine = page.lines.find((line) => /^Owned\b/i.test(line.text));
  if (!ownedLine) return [];
  const borrowedLine = page.lines.find((line) => /^Borrowed\b/i.test(line.text));
  const firstCombinedCadHeader = page.lines
    .flatMap((line) => line.tokens)
    .find((token) => /^CAD¹$/i.test(token.text) && center(token) < 360);
  const modernLayout = (firstCombinedCadHeader ? center(firstCombinedCadHeader) : 300) > 280;
  const cadRange: [number, number] = modernLayout ? [140, 215] : [110, 185];
  const usdRange: [number, number] = modernLayout ? [215, 275] : [185, 235];
  const cashCell = (line: PdfLine | undefined, range: [number, number]): number => {
    if (!line) return 0;
    const token = tokensBetween(line, range[0], range[1]).find((candidate) => MONEY_TOKEN.test(candidate.text));
    if (!token || token.text === "-" || token.text === "—") return 0;
    return parseNumber(token.text) ?? 0;
  };
  const ownedCad = cashCell(ownedLine, cadRange);
  const ownedUsd = cashCell(ownedLine, usdRange);
  const borrowedCad = cashCell(borrowedLine, cadRange);
  const borrowedUsd = cashCell(borrowedLine, usdRange);
  const totalCad = round2(ownedCad + borrowedCad);
  const totalUsd = round2(ownedUsd + borrowedUsd);
  const combined = round2(totalCad + totalUsd * (context.fxRate ?? 0));
  return [
    {
      ...baseRow(context),
      currency_code: "CAD",
      owned_amount: ownedCad,
      borrowed_amount: borrowedCad,
      total_amount: totalCad,
      combined_value_cad: totalCad,
    },
    {
      ...baseRow(context),
      currency_code: "USD",
      owned_amount: ownedUsd,
      borrowed_amount: borrowedUsd,
      total_amount: totalUsd,
      combined_value_cad: context.fxRate == null ? null : round2(combined - totalCad),
    },
  ];
}

function holdingCategory(text: string): HoldingSnapshot["category"] | null {
  if (/Stocks owned/i.test(text)) return "STOCK";
  if (/Exchange-traded funds.*owned/is.test(text)) return "ETF";
  if (/American depository receipts.*owned/is.test(text)) return "ADR";
  if (/Options owned/i.test(text)) return "OPTION";
  return null;
}

function nearestCurrency(page: ExtractedPdfPage, lineIndex: number): CurrencyCode {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const match = page.lines[index].text.match(/Securities held in (CAD|USD)/i);
    if (match) return match[1].toUpperCase() as CurrencyCode;
  }
  return "CAD";
}

function nearestAnchorIndex(page: ExtractedPdfPage, anchors: number[], lineIndex: number): number | null {
  if (anchors.length === 0) return null;
  return [...anchors].sort(
    (a, b) => Math.abs(page.lines[a].y - page.lines[lineIndex].y) - Math.abs(page.lines[b].y - page.lines[lineIndex].y),
  )[0];
}

function parseHoldings(context: StatementContext, page: ExtractedPdfPage): HoldingSnapshot[] {
  const category = holdingCategory(page.text);
  if (!category) return [];
  const anchors = page.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.tokens.some((token) => center(token) < 65) && line.tokens.some((token) => COST_BASES.has(token.text.toUpperCase())))
    .map(({ index }) => index);

  return anchors.map((anchorIndex) => {
    const line = page.lines[anchorIndex];
    const nearbyDescription = page.lines
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) => nearestAnchorIndex(page, anchors, index) === anchorIndex && Math.abs(candidate.y - line.y) <= 18)
      .map(({ candidate }) => textBetween(candidate, 60, 185))
      .filter((value) => value && !/^Description$/i.test(value) && !/^Securities held/i.test(value));
    const basis = line.tokens.find((token) => COST_BASES.has(token.text.toUpperCase()))?.text.toUpperCase() ?? null;
    const rawSymbol = textBetween(line, 0, 60);
    const description = nearbyDescription.join(" ").replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    const option = category === "OPTION" ? optionIdentity(description) : null;
    const performanceValues = line.tokens
      .filter((token) => center(token) > 500 && MONEY_TOKEN.test(token.text))
      .sort((a, b) => center(a) - center(b))
      .map((token) => parseNumber(token.text));
    const returnPercent = performanceValues.length >= 2 ? performanceValues.at(-2) ?? null : null;
    const portfolioPercent = performanceValues.at(-1) ?? null;
    return {
      ...baseRow(context),
      source_page: page.pageNumber,
      category,
      currency_code: nearestCurrency(page, anchorIndex),
      asset_type: category === "OPTION" ? "OPTION" : "SECURITY",
      option_type: option?.optionType ?? null,
      raw_symbol: rawSymbol,
      symbol: option?.symbol ?? rawSymbol.replace(/^\./, ""),
      description,
      cost_basis: basis,
      quantity: valueNearX(line, 260, 28),
      segregated_quantity: valueNearX(line, 302, 25),
      cost_per_share: valueNearX(line, 345, 27),
      position_cost: valueNearX(line, 390, 30),
      market_price: valueNearX(line, 430, 25),
      market_value: valueNearX(line, 470, 30),
      unrealized_pnl: valueNearX(line, 515, 31),
      return_percent: returnPercent,
      portfolio_percent: portfolioPercent != null && portfolioPercent >= 0 ? portfolioPercent : null,
    };
  });
}

function parseTransactions(context: StatementContext, page: ExtractedPdfPage): StatementTransaction[] {
  if (!/\bTransactions\b/i.test(page.text)) return [];
  const anchors = page.lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      const transactionDate = textBetween(line, 0, 82).match(/\d{2}-\d{2}-\d{4}/)?.[0];
      const settlementDate = textBetween(line, 82, 135).match(/\d{2}-\d{2}-\d{4}/)?.[0];
      return Boolean(transactionDate && settlementDate);
    })
    .map(({ index }) => index);

  return anchors.map((anchorIndex, statementRowIndex) => {
    const line = page.lines[anchorIndex];
    const bandLines = page.lines
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate, index }) =>
        nearestAnchorIndex(page, anchors, index) === anchorIndex
        && Math.abs(candidate.y - line.y) <= 22
        && !/^(?:Opening|Closing) balance\b/i.test(textBetween(candidate, 230, 395))
        && !/Current month FX rate|Previous month FX rate|Questrade|All rights reserved/i.test(candidate.text)
      );
    const rawActivityType = bandLines
      .map(({ candidate }) => textBetween(candidate, 130, 185))
      .filter((value) => value && !/^Activity(?: type)?$/i.test(value))
      .join(" ")
      .trim();
    const rawSymbol = bandLines
      .map(({ candidate }) => textBetween(candidate, 185, 230))
      .filter((value) => value && !/^Symbol$/i.test(value))
      .join(" ")
      .trim();
    const description = bandLines
      .map(({ candidate }) => textBetween(candidate, 230, 395))
      .filter((value) => value && !/^Description$/i.test(value))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const cleanDescription = description.replace(/\|/g, " ").replace(/\s+/g, " ").trim();
    const activityType = inferActivityType(rawActivityType, cleanDescription);
    const option = optionIdentity(cleanDescription);
    const cadPrice = valueNearX(line, 449, 21);
    const cadGross = valueNearX(line, 480, 22);
    const cadCommission = valueNearX(line, 515, 21);
    const cadNet = valueNearX(line, 555, 27);
    const usdPrice = valueNearX(line, 603, 22);
    const usdGross = valueNearX(line, 640, 25);
    const usdCommission = valueNearX(line, 682, 23);
    const usdNet = valueNearX(line, 722, 25);
    const hasUsd = [usdPrice, usdGross, usdCommission, usdNet].some((value) => value != null && value !== 0);
    const hasCad = [cadPrice, cadGross, cadCommission, cadNet].some((value) => value != null && value !== 0);
    const normalizedType = normalizeType(activityType, cleanDescription);
    const isFxConversion = normalizedType === "FX_CONVERSION";
    const currency: CurrencyCode | null = isFxConversion ? null : hasUsd ? "USD" : hasCad ? "CAD" : null;
    const fxRate = isFxConversion && cadNet != null && usdNet != null && cadNet !== 0 && usdNet !== 0
      ? round2(Math.abs(cadNet / usdNet))
      : null;
    const transactionDateText = textBetween(line, 0, 82).match(/\d{2}-\d{2}-\d{4}/)?.[0] ?? "";
    const settlementDateText = textBetween(line, 82, 135).match(/\d{2}-\d{2}-\d{4}/)?.[0] ?? "";
    const withoutKey: Omit<StatementTransaction, "import_key"> = {
      ...baseRow(context),
      source_page: page.pageNumber,
      statement_row_index: statementRowIndex + 1,
      transaction_date: isoDate(transactionDateText),
      settlement_date: isoDate(settlementDateText),
      raw_activity_type: rawActivityType,
      activity_type: activityType,
      normalized_type: normalizedType,
      asset_type: option ? "OPTION" : rawSymbol ? "SECURITY" : isFxConversion ? "CURRENCY" : "CASH",
      option_type: option?.optionType ?? null,
      raw_symbol: rawSymbol,
      symbol: option?.symbol ?? rawSymbol.replace(/^\./, ""),
      description: cleanDescription,
      record_date: taggedDescriptionDate(cleanDescription, "REC"),
      payment_date: taggedDescriptionDate(cleanDescription, "PAY"),
      currency_code: currency,
      quantity: valueNearX(line, 407, 22),
      price: isFxConversion ? null : currency === "USD" ? usdPrice : cadPrice,
      gross_amount: isFxConversion ? null : currency === "USD" ? usdGross : cadGross,
      commission: isFxConversion ? null : currency === "USD" ? usdCommission : cadCommission,
      net_amount: isFxConversion ? null : currency === "USD" ? usdNet : cadNet,
      fx_rate: fxRate,
      cad_price: cadPrice,
      cad_gross_amount: cadGross,
      cad_commission: cadCommission,
      cad_net_amount: cadNet,
      usd_price: usdPrice,
      usd_gross_amount: usdGross,
      usd_commission: usdCommission,
      usd_net_amount: usdNet,
      raw_text: bandLines.map(({ candidate }) => candidate.text).join(" | "),
    };
    return { import_key: makeImportKey(withoutKey), ...withoutKey };
  });
}

function validateStatement(
  context: StatementContext,
  snapshot: StatementSnapshot,
  categories: ParsedBalanceCategory[],
  cash: CashBalanceSnapshot[],
  holdings: HoldingSnapshot[],
  transactions: StatementTransaction[],
  issues: ImportIssue[],
): void {
  if (categories.length !== 5) {
    addIssue(issues, context, "ERROR", "balance_category", `Expected 5 balance categories; extracted ${categories.length}.`);
  }
  const categoryTotal = categories.reduce((sum, row) => sum + row.total_value_cad, 0);
  if (snapshot.total_balance_cad != null && Math.abs(categoryTotal - snapshot.total_balance_cad) > 0.1) {
    addIssue(issues, context, "WARNING", "balance_category", `Category total ${categoryTotal.toFixed(2)} does not match balance total ${snapshot.total_balance_cad.toFixed(2)}.`);
  }
  const cad = cash.find((row) => row.currency_code === "CAD")?.total_amount;
  const usd = cash.find((row) => row.currency_code === "USD")?.total_amount;
  if (cad != null && usd != null && context.fxRate != null && snapshot.total_cash_cad != null) {
    const converted = cad + usd * context.fxRate;
    if (Math.abs(converted - snapshot.total_cash_cad) > 0.5) {
      addIssue(issues, context, "WARNING", "cash_balance", `Converted cash ${converted.toFixed(2)} does not match statement cash ${snapshot.total_cash_cad.toFixed(2)}.`);
    }
  }
  const holdingValueCad = holdings.reduce(
    (sum, row) => sum + (row.market_value ?? 0) * (row.currency_code === "USD" ? context.fxRate ?? 0 : 1),
    0,
  );
  if (snapshot.total_market_value_cad != null && holdings.length > 0 && Math.abs(holdingValueCad - snapshot.total_market_value_cad) > 1) {
    addIssue(issues, context, "WARNING", "holding", `Converted holding value ${holdingValueCad.toFixed(2)} does not match total market value ${snapshot.total_market_value_cad.toFixed(2)}.`);
  }
  for (const transaction of transactions) {
    if (!transaction.activity_type) {
      addIssue(issues, context, "WARNING", "transaction", "Transaction activity type could not be read or inferred from its description; retained for review.", transaction.source_page, transaction.raw_text);
    }
    if (!transaction.description) {
      addIssue(issues, context, "WARNING", "transaction", "Transaction has no description; retained for review.", transaction.source_page, transaction.raw_text);
    }
    if (/FX rate:|USD\s*=|Previous month|Current month:/i.test(`${transaction.activity_type} ${transaction.symbol} ${transaction.description}`)) {
      addIssue(issues, context, "ERROR", "transaction", "Statement footer text leaked into transaction fields.", transaction.source_page, transaction.raw_text);
    }
    if (transaction.option_type && !transaction.symbol) {
      addIssue(issues, context, "ERROR", "transaction", "Option transaction symbol could not be derived.", transaction.source_page, transaction.raw_text);
    }
  }
}

export async function extractStatement(pdfPath: string): Promise<ExtractedStatementData> {
  const data = emptyData();
  let pages: ExtractedPdfPage[];
  try {
    pages = await extractPdfPages(pdfPath);
  } catch (error) {
    addIssue(data.issues, { sourceFile: path.basename(pdfPath) }, "ERROR", "statement", `Could not read PDF: ${error instanceof Error ? error.message : String(error)}`);
    return data;
  }
  const context = contextFromPages(pdfPath, pages, data.issues);
  if (!context) return data;

  const balancePage = pages.find((page) => /\bBalances\b/i.test(page.text) && /CURRENT MONTH/i.test(page.text));
  const bookCostPage = pages.find((page) => /Total Book Cost/i.test(page.text));
  const cashPage = pages.find((page) =>
    !page.lines.some((line) => line.text.includes("Balances"))
    && page.text.includes("CURRENT MONTH")
    && page.lines.some((line) => line.text.startsWith("Cash"))
    && page.lines.some((line) => line.text.startsWith("Owned ")),
  );
  const balanceResult = balancePage
    ? parseBalances(balancePage)
    : { categories: [], totals: { owned_balance_cad: null, borrowed_balance_cad: null, total_balance_cad: null } };
  const bookCost = bookCostPage
    ? parseBookCost(bookCostPage)
    : { total_market_value_cad: null, total_position_cost_cad: null, total_cash_cad: null, total_book_value_cad: null };
  const cash = cashPage ? parseCash(context, cashPage) : [];
  const holdings = pages.flatMap((page) => parseHoldings(context, page));
  const transactions = pages.flatMap((page) => parseTransactions(context, page));
  const snapshot: StatementSnapshot = {
    ...baseRow(context),
    current_fx_usd_cad: context.fxRate,
    ...bookCost,
    ...balanceResult.totals,
  };

  if (!balancePage) addIssue(data.issues, context, "ERROR", "balance_category", "Balances page was not found.");
  if (!bookCostPage) addIssue(data.issues, context, "WARNING", "statement", "Total Book Cost page was not found.");
  if (!cashPage) {
    const cashCategory = balanceResult.categories.find((row) => row.category === "CASH");
    if ((cashCategory?.total_value_cad ?? 0) === 0) {
      cash.push(
        { ...baseRow(context), currency_code: "CAD", owned_amount: 0, borrowed_amount: 0, total_amount: 0, combined_value_cad: 0 },
        { ...baseRow(context), currency_code: "USD", owned_amount: 0, borrowed_amount: 0, total_amount: 0, combined_value_cad: 0 },
      );
    } else {
      addIssue(data.issues, context, "WARNING", "cash_balance", "Cash page was not found for a non-zero cash balance.");
    }
  }

  validateStatement(context, snapshot, balanceResult.categories, cash, holdings, transactions, data.issues);
  data.statements.push(snapshot);
  data.cashBalances.push(...cash);
  data.holdings.push(...holdings);
  data.transactions.push(...transactions);
  return data;
}

async function findPdfs(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) results.push(...(await findPdfs(fullPath)));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pdf")) results.push(fullPath);
  }
  return results.sort((a, b) => a.localeCompare(b));
}

export async function extractStatements(inputRoot: string): Promise<ExtractedStatementData> {
  const combined = emptyData();
  const rootEntries = await readdir(inputRoot, { withFileTypes: true });
  const accountFolders = rootEntries
    .filter((entry) => entry.isDirectory() && /^(TFSA|RRSP)$/i.test(entry.name))
    .map((entry) => path.join(inputRoot, entry.name));
  const pdfs = accountFolders.length > 0
    ? (await Promise.all(accountFolders.map(findPdfs))).flat().sort((a, b) => a.localeCompare(b))
    : await findPdfs(inputRoot);
  for (const [index, pdf] of pdfs.entries()) {
    process.stdout.write(`[${index + 1}/${pdfs.length}] ${path.relative(inputRoot, pdf)}\n`);
    const extracted = await extractStatement(pdf);
    combined.statements.push(...extracted.statements);
    combined.cashBalances.push(...extracted.cashBalances);
    combined.holdings.push(...extracted.holdings);
    combined.transactions.push(...extracted.transactions);
    combined.issues.push(...extracted.issues);
  }

  const seenStatements = new Map<string, string>();
  for (const statement of combined.statements) {
    const previous = seenStatements.get(statement.statement_key);
    if (previous) {
      addIssue(
        combined.issues,
        { sourceFile: statement.source_file, statementKey: statement.statement_key },
        "ERROR",
        "statement",
        `Duplicate account/date snapshot also found in ${previous}.`,
      );
    } else {
      seenStatements.set(statement.statement_key, statement.source_file);
    }
  }
  const keyCounts = new Map<string, number>();
  for (const transaction of combined.transactions) keyCounts.set(transaction.import_key, (keyCounts.get(transaction.import_key) ?? 0) + 1);
  for (const [importKey, count] of keyCounts) {
    if (count > 1) {
      const transaction = combined.transactions.find((row) => row.import_key === importKey)!;
      addIssue(
        combined.issues,
        { sourceFile: transaction.source_file, statementKey: transaction.statement_key },
        "WARNING",
        "transaction",
        `Potential duplicate transaction key occurs ${count} times: ${importKey}.`,
        transaction.source_page,
        transaction.raw_text,
      );
    }
  }
  return combined;
}
