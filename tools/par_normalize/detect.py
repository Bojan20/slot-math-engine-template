"""Format detector — Faza 1.3.

Detects vendor PAR sheet format by magic bytes + content shape.
Supported: xlsx, pdf, json, csv, yaml.
"""
from __future__ import annotations
import json
import zipfile
from pathlib import Path
from typing import Literal

FormatKind = Literal["xlsx", "pdf", "json", "csv", "yaml", "unknown"]


_XLSX_MAGIC = b"PK\x03\x04"
_PDF_MAGIC = b"%PDF"


def detect_format(path: Path | str) -> FormatKind:
    """Return detected format kind for *path*.

    Strategy:
      1. Magic bytes (fast path for xlsx, pdf).
      2. ZIP probe for xlsx (openpyxl workbooks are ZIPs).
      3. Text heuristics for json/csv/yaml.
    """
    p = Path(path)
    if not p.is_file():
        raise FileNotFoundError(p)

    header = p.read_bytes()[:8]

    # Fast magic paths
    if header.startswith(_XLSX_MAGIC):
        if _is_xlsx(p):
            return "xlsx"
    if header.startswith(_PDF_MAGIC):
        return "pdf"

    # Text-based heuristics
    text = p.read_text(encoding="utf-8", errors="replace").strip()
    if not text:
        return "unknown"

    first = text[0]
    if first in "[{":
        try:
            json.loads(text)
            return "json"
        except json.JSONDecodeError:
            pass

    if text.startswith("---") or _looks_like_yaml(text):
        return "yaml"

    if _looks_like_csv(text):
        return "csv"

    return "unknown"


def _is_xlsx(path: Path) -> bool:
    """A ZIP archive containing xl/workbook.xml is an XLSX."""
    try:
        with zipfile.ZipFile(path, "r") as z:
            namelist = z.namelist()
            return "xl/workbook.xml" in namelist or "[Content_Types].xml" in namelist
    except zipfile.BadZipFile:
        return False


def _looks_like_yaml(text: str) -> bool:
    lines = text.splitlines()[:20]
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        if ": " in stripped or stripped.endswith(":"):
            return True
        if stripped.startswith("- "):
            return True
    return False


def _looks_like_csv(text: str) -> bool:
    lines = text.splitlines()[:10]
    if len(lines) < 2:
        return False
    commas = [line.count(",") for line in lines if line.strip()]
    if not commas:
        return False
    # Consistent comma count across non-empty lines suggests CSV
    return len(set(commas)) <= 2 and commas[0] > 0
