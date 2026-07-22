# Questrade statement importer

This package scans historical Questrade TFSA and RRSP PDF statements once and
can send the exact same parsed data to either a review workbook or PostgreSQL.

The shared pipeline is:

- `pdf.ts` extracts positioned text from each PDF page.
- `parser.ts` parses and validates statements, cash balances, holdings, and transactions.
- `workbook.ts` writes the parsed result to Excel for review.
- `database.ts` writes the parsed result to the application database.

The original Python prototype was moved from `pytrade_data` to
`legacy/extract_questrade_statements.py` for reference. The TypeScript pipeline
is the maintained application implementation.

## Excel review

Set `QESTRADE_REPORTS_DIR` in the project-root `.env_v2` file. The file is
ignored by Git and denied to Codex by the project permission profile.

Then, from the repository root:

```powershell
pnpm statements:extract
```

The workbook is written to
`generated files/Questrade_Statements_Review.xlsx`.
An alternate filename can be supplied with `--output`; it remains inside that
generated-files directory.

## Database import

Apply the generated database migration first. A dry run parses every PDF,
performs validation, and confirms that statement account numbers match existing
application accounts without writing rows:

```powershell
pnpm statements:import-dr
```

Import after reviewing the result:

```powershell
pnpm statements:import
```

Database imports write directly to the application's canonical tables:

- historical statement positions go to `holdings`;
- statement activity is idempotently upserted into `transactions`;
- the latest statement cash can populate `account_balances`, but it never
  overwrites a live SnapTrade balance.

No statement-specific application tables are created. Holdings are replaced
atomically for the same account, effective date, and source when reimported.
Imports with extraction errors are rejected by default; `--allow-errors` is
available for an explicitly reviewed exception.

The statement's asset-category balance summary is parsed only as an in-memory
cross-check against the statement total. It is not exported or stored because
it aggregates cash and holding detail already retained elsewhere. Holding P&L,
return percentage, and portfolio percentage also remain derived review values;
the database stores quantity, position cost, market price, and market value.
All extracted and imported numeric values are rounded to two decimal places.

When the input directory contains `TFSA` or `RRSP` folders, only PDFs in those
account folders are scanned. Statement dates and account numbers are read from
the PDF contents, not filenames.
