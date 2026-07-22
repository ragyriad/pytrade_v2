from __future__ import annotations

import os
import re
from pathlib import Path
from typing import List, Dict, Any

import pdfplumber
import xlsxwriter

configured_reports_dir = os.environ.get("QESTRADE_REPORTS_DIR", "").strip()
if not configured_reports_dir:
    raise RuntimeError("Missing required environment variable: QESTRADE_REPORTS_DIR")

ROOT = Path(configured_reports_dir).resolve()
OUTPUT_FILE = (
    Path(__file__).resolve().parents[3]
    / "generated files"
    / "Questrade_Statements_Extracted.xlsx"
)

ACCOUNT_FOLDERS = ["TFSA", "RRSP"]


def normalize_text(text: str) -> str:
    normalized_lines = []
    for line in text.replace("\xa0", " ").splitlines():
        cleaned = re.sub(r"[ \t]+", " ", line).strip()
        if cleaned:
            normalized_lines.append(cleaned)
    return "\n".join(normalized_lines)


def parse_statement_date(path: Path) -> str:
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", path.name)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return path.stem


def extract_account_number(text: str) -> str:
    m = re.search(r"Account\s*#:\s*(\d+)", text, re.IGNORECASE)
    return m.group(1) if m else ""


def parse_allocations(page_text: str, account_number: str, statement_date: str, account_type: str, source_file: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for line in page_text.splitlines():
        line = normalize_text(line)
        if not line:
            continue
        if line.startswith("Cash") or line.startswith("Stocks") or line.startswith("Exchange traded funds") or line.startswith("American depository receipts") or line.startswith("Options") or line.startswith("Total"):
            parts = line.split()
            asset_class = parts[0] if parts[0] != "Exchange" else "Exchange traded funds"
            if asset_class == "Exchange" and len(parts) > 2 and parts[1] == "traded":
                asset_class = "Exchange traded funds"
            captured = re.findall(r"[-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?", line)
            current_value = captured[0] if captured else ""
            rows.append({
                "account_type": account_type,
                "account_number": account_number,
                "statement_date": statement_date,
                "asset_class": asset_class,
                "current_month_value": current_value,
                "source_file": source_file.name,
            })
    return rows


def parse_account_summary(page_text: str, account_number: str, statement_date: str, account_type: str, source_file: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for line in page_text.splitlines():
        line = normalize_text(line)
        if not line:
            continue
        if line.startswith("Opening balance") or line.startswith("Deposits") or line.startswith("Withdrawals") or line.startswith("Change in balance") or line.startswith("Closing balance"):
            parts = line.split()
            metric = parts[0] if parts[0] != "Change" else "Change in balance"
            if parts[0] == "Change" and len(parts) > 2 and parts[1] == "in":
                metric = "Change in balance"
            values = [part for part in parts[1:] if re.match(r"^[+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-$", part)]
            if values:
                rows.append({
                    "account_type": account_type,
                    "account_number": account_number,
                    "statement_date": statement_date,
                    "metric": metric,
                    "values": values,
                    "source_file": source_file.name,
                })
    return rows


def parse_transactions(page_text: str, account_number: str, statement_date: str, account_type: str, source_file: Path) -> List[Dict[str, Any]]:
    transactions: List[Dict[str, Any]] = []
    lines = page_text.splitlines()

    for raw_line in lines:
        line = normalize_text(raw_line)
        if not line:
            continue

        if re.match(r"^\d{2}-\d{2}-\d{4}\s+\d{2}-\d{2}-\d{4}", line):
            parts = line.split()
            if len(parts) < 4:
                continue
            activity_type = parts[2]
            symbol = parts[3]
            description_parts = parts[4:]
            description = " ".join(description_parts).strip()
            net_amount = ""
            money_matches = re.findall(r"[-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\([^)]+\)", line)
            if money_matches:
                net_amount = money_matches[-1]
            transactions.append({
                "account_type": account_type,
                "account_number": account_number,
                "statement_date": statement_date,
                "transaction_date": parts[0],
                "settle_date": parts[1],
                "activity_type": activity_type,
                "symbol": symbol,
                "description": description,
                "net_amount": net_amount,
                "raw_line": line,
                "source_file": source_file.name,
            })

    return transactions


def parse_activity_summary(page_text: str, account_number: str, statement_date: str, account_type: str, source_file: Path) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for line in page_text.splitlines():
        line = normalize_text(line)
        if not line:
            continue
        if line.startswith("Dividend") or line.startswith("Interest") or line.startswith("Security Fee") or line.startswith("Fees And Rebates"):
            metric = line.split()[0]
            values = [part for part in line.split()[1:] if re.match(r"^[+-]?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^-$", part)]
            rows.append({
                "account_type": account_type,
                "account_number": account_number,
                "statement_date": statement_date,
                "metric": metric,
                "values": values,
                "source_file": source_file.name,
            })
    return rows


def extract_statement(pdf_path: Path) -> Dict[str, List[Dict[str, Any]]]:
    account_type = pdf_path.parent.name
    statement_date = parse_statement_date(pdf_path)
    with pdfplumber.open(pdf_path) as pdf:
        pages = [normalize_text(page.extract_text() or "") for page in pdf.pages]

    combined_text = "\n".join(pages)
    account_number = extract_account_number(combined_text)
    allocations = []
    account_summary = []
    transactions = []
    activity_summary = []

    for page_text in pages:
        if not page_text:
            continue
        allocations.extend(parse_allocations(page_text, account_number, statement_date, account_type, pdf_path))
        account_summary.extend(parse_account_summary(page_text, account_number, statement_date, account_type, pdf_path))
        transactions.extend(parse_transactions(page_text, account_number, statement_date, account_type, pdf_path))
        activity_summary.extend(parse_activity_summary(page_text, account_number, statement_date, account_type, pdf_path))

    return {
        "allocations": allocations,
        "account_summary": account_summary,
        "transactions": transactions,
        "activity_summary": activity_summary,
    }


def write_workbook(output_path: Path, data: Dict[str, List[Dict[str, Any]]]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    workbook = xlsxwriter.Workbook(output_path)
    for sheet_name, rows in data.items():
        worksheet = workbook.add_worksheet(sheet_name.title())
        if not rows:
            worksheet.write_row(0, 0, ["empty"])
            continue
        headers = sorted({key for row in rows for key in row.keys()})
        worksheet.write_row(0, 0, headers)
        for row_idx, row in enumerate(rows, start=1):
            values = []
            for header in headers:
                value = row.get(header, "")
                if isinstance(value, list):
                    value = ", ".join(str(v) for v in value)
                values.append(value)
            worksheet.write_row(row_idx, 0, values)
    workbook.close()


def process_all_statements() -> Dict[str, List[Dict[str, Any]]]:
    combined: Dict[str, List[Dict[str, Any]]] = {
        "allocations": [],
        "account_summary": [],
        "transactions": [],
        "activity_summary": [],
    }

    for folder_name in ACCOUNT_FOLDERS:
        folder = ROOT / folder_name
        if not folder.exists():
            continue
        pdf_files = sorted(folder.glob("*.pdf"))
        for pdf_path in pdf_files:
            statement_data = extract_statement(pdf_path)
            for key in combined:
                combined[key].extend(statement_data[key])

    write_workbook(OUTPUT_FILE, combined)
    return combined


if __name__ == "__main__":
    process_all_statements()
    print(f"Wrote {OUTPUT_FILE}")
