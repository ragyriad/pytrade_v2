import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

export interface PdfToken {
  text: string;
  x: number;
  y: number;
  width: number;
}

export interface PdfLine {
  y: number;
  tokens: PdfToken[];
  text: string;
}

export interface ExtractedPdfPage {
  pageNumber: number;
  width: number;
  height: number;
  lines: PdfLine[];
  text: string;
}

function tokeniseItem(item: PdfTextItem): PdfToken[] {
  const source = item.str.replace(/\u00a0/g, " ");
  const matches = [...source.matchAll(/\S+/g)];
  if (matches.length === 0) return [];

  const itemX = item.transform[4];
  const itemY = item.transform[5];
  const sourceLength = Math.max(source.length, 1);

  return matches.map((match) => {
    const start = match.index ?? 0;
    const text = match[0];
    return {
      text,
      x: itemX + item.width * (start / sourceLength),
      y: itemY,
      width: Math.max(item.width * (text.length / sourceLength), 0.1),
    };
  });
}

function groupLines(tokens: PdfToken[], tolerance = 2.5): PdfLine[] {
  const groups: Array<{ y: number; tokens: PdfToken[] }> = [];
  for (const token of [...tokens].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let group = groups.find((candidate) => Math.abs(candidate.y - token.y) <= tolerance);
    if (!group) {
      group = { y: token.y, tokens: [] };
      groups.push(group);
    }
    group.tokens.push(token);
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => {
      const sorted = group.tokens.sort((a, b) => a.x - b.x);
      return {
        y: group.y,
        tokens: sorted,
        text: sorted.map((token) => token.text).join(" ").replace(/\s+/g, " ").trim(),
      };
    });
}

export async function extractPdfPages(path: string): Promise<ExtractedPdfPage[]> {
  const data = new Uint8Array(await readFile(path));
  const document = await getDocument({ data, useSystemFonts: true }).promise;
  const pages: ExtractedPdfPage[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent({ disableNormalization: false });
      const tokens = content.items
        .filter((item): item is typeof item & PdfTextItem => "str" in item)
        .flatMap(tokeniseItem);
      const lines = groupLines(tokens);
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        lines,
        text: lines.map((line) => line.text).join("\n"),
      });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return pages;
}
