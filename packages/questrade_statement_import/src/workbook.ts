import ExcelJS from "exceljs";
import type { ExtractedStatementData } from "./types.js";

type Row = Record<string, unknown>;

const SHEETS: Array<{ name: string; key: keyof ExtractedStatementData }> = [
  { name: "account_balances", key: "cashBalances" },
  { name: "holdings", key: "holdings" },
  { name: "transactions", key: "transactions" },
  { name: "import_issues", key: "issues" },
];

function displayValue(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value instanceof Date) return value;
  return JSON.stringify(value);
}

function addDataSheet(workbook: ExcelJS.Workbook, name: string, rows: Row[]): void {
  const worksheet = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : ["no_rows"];
  const values = rows.length > 0
    ? rows.map((row) => headers.map((header) => displayValue(row[header])))
    : [["No rows extracted"]];
  worksheet.addRows([headers, ...values]);

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  headerRow.alignment = { vertical: "middle" };
  worksheet.columns.forEach((column, index) => {
    const header = headers[index];
    const longest = Math.max(
      header.length,
      ...rows.slice(0, 500).map((row) => String(row[header] ?? "").length),
    );
    column.width = Math.min(Math.max(longest + 2, 12), header.includes("description") || header.includes("raw_text") || header === "message" ? 70 : 32);
    if (header.includes("amount") || header.includes("value") || header.includes("cost") || header.includes("price") || header.includes("quantity") || header.includes("pnl") || header.includes("percent") || header.includes("fx")) {
      column.numFmt = "#,##0.00;[Red](#,##0.00);-";
    }
  });
  worksheet.autoFilter = { from: "A1", to: worksheet.getCell(1, headers.length).address };
}

export async function writeReviewWorkbook(outputPath: string, data: ExtractedStatementData): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pytrade Questrade statement importer";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  for (const sheet of SHEETS) addDataSheet(workbook, sheet.name, data[sheet.key] as unknown as Row[]);
  await workbook.xlsx.writeFile(outputPath);
}
