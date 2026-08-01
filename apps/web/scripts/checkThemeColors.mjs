import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appRoot = path.join(webRoot, "app");
const themeFile = path.join(appRoot, "assets", "styles", "theme.css");
const checkedExtensions = new Set([".css", ".ts", ".tsx"]);

const forbiddenPatterns = [
  {
    description: "raw color value",
    expression: /#[0-9a-f]{3,8}\b|(?:rgb|rgba|hsl|hsla)\s*\(/gi,
  },
  {
    description: "Tailwind palette color",
    expression:
      /\b(?:bg|text|border(?:-[trblxy])?|ring(?:-offset)?|outline|decoration|divide|placeholder|caret|accent|fill|stroke|from|via|to|shadow)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-[0-9]{2,3})?(?:\/[0-9]{1,3})?\b/gi,
  },
];

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(entryPath);
    }

    return checkedExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

const violations = [];

for (const filePath of collectFiles(appRoot)) {
  if (path.resolve(filePath) === path.resolve(themeFile)) {
    continue;
  }

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);

  lines.forEach((line, lineIndex) => {
    for (const { description, expression } of forbiddenPatterns) {
      expression.lastIndex = 0;

      for (const match of line.matchAll(expression)) {
        violations.push({
          description,
          filePath,
          line: lineIndex + 1,
          column: (match.index ?? 0) + 1,
          value: match[0],
        });
      }
    }
  });
}

if (violations.length > 0) {
  console.error(
    "Theme color check failed. Define colors in app/assets/styles/theme.css and use semantic theme tokens elsewhere.\n",
  );

  for (const violation of violations) {
    const relativePath = path.relative(webRoot, violation.filePath);
    console.error(
      `${relativePath}:${violation.line}:${violation.column} ${violation.description}: ${violation.value}`,
    );
  }

  process.exitCode = 1;
} else {
  console.log("Theme color check passed.");
}
