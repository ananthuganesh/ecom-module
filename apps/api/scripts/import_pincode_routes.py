"""Import a carrier's pincode exclusion list into the routing table.

Reads DTDC's IP-dispatch branch list — the pincodes DTDC will not deliver
normally — and routes each of them to Delhivery. Defaults to the CSV committed
alongside this script, converted from DTDC's "IP DISPATCH BRANCHES LIST.xlsx".

Usage (from apps/api, with .venv active):

    python -m scripts.import_pincode_routes                 # bundled CSV
    python -m scripts.import_pincode_routes --dry-run
    python -m scripts.import_pincode_routes new_list.csv --replace

Expected columns, matched case-insensitively by header name:
PINCODE (required), BR_CITY, STATE, OFFICE_NAME, END_MILE_TAT. An .xlsx path is
also accepted and parsed with the stdlib, but CSV is preferred — it diffs in
git, so an updated list from DTDC shows exactly which pincodes changed.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Iterator

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.db import close_db, init_db  # noqa: E402
from app.services import pincode_routes  # noqa: E402

# NOTE: stdlib ElementTree does not resolve external entities, but it is not
# hardened against entity-expansion (billion-laughs) DoS. That is acceptable
# here because this is an operator-run CLI over a file received from the
# carrier. If this parser is ever put behind an HTTP upload, switch to
# defusedxml first.
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

DEFAULT_CSV = Path(__file__).resolve().parent / "dtdc_ip_dispatch_pincodes.csv"

COLUMN_ALIASES = {
    "pincode": ("pincode", "pin", "pin_code", "pincodes"),
    "city": ("br_city", "city", "branch_city"),
    "state": ("state",),
    "branch": ("office_name", "branch", "branch_name"),
    "tatDays": ("end_mile_tat", "tat", "tat_days"),
}


def _column_letter(ref: str) -> str:
    return "".join(ch for ch in ref if ch.isalpha())


def read_xlsx(path: Path) -> Iterator[dict[str, str]]:
    """Yield row dicts keyed by header name from the first worksheet."""
    with zipfile.ZipFile(path) as archive:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared = ["".join(t.text or "" for t in si.iter(NS + "t")) for si in root.iter(NS + "si")]

        sheet = ET.fromstring(archive.read("xl/worksheets/sheet1.xml"))
        header: dict[str, str] = {}
        for row in sheet.iter(NS + "row"):
            values: dict[str, str] = {}
            for cell in row.iter(NS + "c"):
                node = cell.find(NS + "v")
                if node is None or node.text is None:
                    continue
                raw = shared[int(node.text)] if cell.get("t") == "s" else node.text
                values[_column_letter(cell.get("r") or "")] = str(raw).strip()
            if not values:
                continue
            if not header:
                header = {col: name.strip().lower() for col, name in values.items()}
                continue
            yield {header.get(col, col): value for col, value in values.items()}


def read_csv(path: Path) -> Iterator[dict[str, str]]:
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            yield {(k or "").strip().lower(): (v or "").strip() for k, v in row.items()}


def pick(row: dict[str, Any], field: str) -> str | None:
    for alias in COLUMN_ALIASES[field]:
        if alias in row and str(row[alias]).strip():
            return str(row[alias]).strip()
    return None


def build_rows(source_rows: Iterator[dict[str, Any]], carrier: str) -> tuple[list[dict], list[str]]:
    out: list[dict] = []
    seen: set[str] = set()
    rejected: list[str] = []

    for row in source_rows:
        raw = pick(row, "pincode")
        pin = pincode_routes.normalize_pincode(raw)
        if not pin:
            if raw:
                rejected.append(str(raw))
            continue
        if pin in seen:
            continue
        seen.add(pin)

        tat = pick(row, "tatDays")
        try:
            tat_days = int(float(tat)) if tat else None
        except ValueError:
            tat_days = None

        out.append(
            {
                "pincode": pin,
                "carrier": carrier,
                "reason": "DTDC IP-dispatch pincode (not normally delivered)",
                "city": pick(row, "city"),
                "state": pick(row, "state"),
                "branch": pick(row, "branch"),
                "tatDays": tat_days,
            }
        )
    return out, rejected


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "path",
        nargs="?",
        default=str(DEFAULT_CSV),
        help=f"Path to the .csv (or .xlsx) list. Default: {DEFAULT_CSV.name}",
    )
    parser.add_argument("--carrier", default="delhivery", help="Carrier these pincodes route to")
    parser.add_argument(
        "--source",
        default=pincode_routes.DTDC_IP_DISPATCH_SOURCE,
        help="Import tag, so a re-import can replace exactly this set",
    )
    parser.add_argument("--replace", action="store_true", help="Delete existing rows for this source first")
    parser.add_argument("--dry-run", action="store_true", help="Parse and report without writing")
    args = parser.parse_args()

    path = Path(args.path).expanduser()
    if not path.is_file():
        print(f"No such file: {path}")
        return 1

    reader = read_xlsx(path) if path.suffix.lower() == ".xlsx" else read_csv(path)
    rows, rejected = build_rows(reader, args.carrier.strip().lower())

    print(f"Parsed {len(rows)} unique pincodes from {path.name} → {args.carrier}")
    if rejected:
        print(f"  skipped {len(rejected)} malformed values, e.g. {rejected[:5]}")
    if not rows:
        print("Nothing to import.")
        return 1
    print(f"  sample: {[r['pincode'] for r in rows[:5]]}")

    if args.dry_run:
        print("Dry run — nothing written.")
        return 0

    await init_db()
    try:
        if args.replace:
            removed = await pincode_routes.clear_source(args.source)
            print(f"  removed {removed} existing rows for source '{args.source}'")
        result = await pincode_routes.upsert_routes(rows, source=args.source)
        total = await pincode_routes.route_count()
        print(
            f"Imported: created={result['created']} updated={result['updated']} "
            f"skipped={result['skipped']} | routing table now holds {total} pincodes"
        )
    finally:
        await close_db()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
