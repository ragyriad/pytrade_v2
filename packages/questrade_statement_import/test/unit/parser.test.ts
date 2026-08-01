import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { assert, test } from "vitest";
import {
  findStatementPdfs,
  parseStatementTransactions,
  type StatementParsingContext,
} from "../../src/parser.js";
import type { ExtractedPdfPage, PdfLine, PdfToken } from "../../src/pdf.js";

function token(text: string, x: number, y: number, width = 12): PdfToken {
  return { text, x, y, width };
}

function line(y: number, tokens: PdfToken[]): PdfLine {
  return {
    y,
    tokens,
    text: tokens.map((value) => value.text).join(" "),
  };
}

test("recursively discovers statements in every reports subdirectory", async () => {
  const root = await mkdtemp(path.join(process.cwd(), ".statement-discovery-"));
  try {
    await mkdir(path.join(root, "RRSP", "archive"), { recursive: true });
    await mkdir(path.join(root, "TFSA"), { recursive: true });
    await writeFile(path.join(root, "RRSP", "one.pdf"), "");
    await writeFile(path.join(root, "RRSP", "archive", "two.PDF"), "");
    await writeFile(path.join(root, "TFSA", "three.pdf"), "");
    await writeFile(path.join(root, "ignored.xlsx"), "");

    const discovered = await findStatementPdfs(root);
    assert.deepEqual(
      discovered.map((value) => path.relative(root, value).replaceAll("\\", "/")),
      ["RRSP/archive/two.PDF", "RRSP/one.pdf", "TFSA/three.pdf"]
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parses the slash-date transaction layout used by 2019 statements", () => {
  const header = line(500, [
    token("Trans.", 31, 500, 17),
    token("date¹", 50, 500, 14),
    token("Settle", 84, 500, 15),
    token("date¹", 101, 500, 14),
    token("Activity", 135, 500, 20),
    token("type", 156, 500, 12),
    token("Symbol", 183, 500, 20),
    token("Description", 217, 500, 31),
    token("Qty", 430, 500, 10),
    token("Price", 471, 500, 14),
    token("Gross¹", 507, 500, 18),
    token("Com.¹", 547, 500, 16),
    token("Net¹", 595, 500, 12),
    token("Price", 630, 500, 14),
    token("Gross¹", 666, 500, 18),
    token("Com.¹", 704, 500, 16),
    token("Net¹", 750, 500, 12),
  ]);
  const description = line(403, [
    token("CANADIAN", 217, 403, 30),
    token("IMPERIAL", 250, 403, 28),
    token("BANK", 281, 403, 18),
    token("OF", 302, 403, 8),
    token("COMMERCE", 313, 403, 31),
  ]);
  const transaction = line(400, [
    token("12/17/2019", 31, 400, 30),
    token("12/19/2019", 84, 400, 30),
    token("Buy", 135, 400, 11),
    token(".CM", 183, 400, 17),
    token("WE", 347, 400, 10),
    token("ACTED", 360, 400, 20),
    token("AS", 383, 400, 9),
    token("AGENT", 395, 400, 21),
    token("5", 433, 400, 7),
    token("109.770", 470, 400, 16),
    token("(548.85)", 503, 400, 23),
    token("(4.97)", 548, 400, 16),
    token("(553.82)", 584, 400, 23),
    token("-", 642, 400, 2),
    token("-", 682, 400, 2),
    token("-", 719, 400, 2),
    token("-", 760, 400, 2),
  ]);
  const page: ExtractedPdfPage = {
    pageNumber: 13,
    width: 792,
    height: 612,
    lines: [header, description, transaction],
    text: `Transactions\n${header.text}\n${description.text}\n${transaction.text}`,
  };
  const context: StatementParsingContext = {
    sourceFile: "Individual RRSP_2019-12-01.pdf",
    accountNumber: "51978003",
    accountType: "RRSP",
    statementDate: "2019-12-31",
    statementKey: "51978003:2019-12-31",
    fxRate: 1.299,
  };

  const [parsed] = parseStatementTransactions(context, page);
  assert.equal(parsed.transaction_date, "2019-12-17");
  assert.equal(parsed.settlement_date, "2019-12-19");
  assert.equal(parsed.raw_symbol, ".CM");
  assert.equal(parsed.symbol, "CM");
  assert.equal(parsed.description, "CANADIAN IMPERIAL BANK OF COMMERCE WE ACTED AS AGENT");
  assert.equal(parsed.quantity, 5);
  assert.equal(parsed.cad_net_amount, -553.82);
});
