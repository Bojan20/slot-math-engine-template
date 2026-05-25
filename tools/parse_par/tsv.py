"""Low-level TSV IO + cell coercion helpers.

Vendor-agnostic. Identical semantics to the game-specific
`parse_par.py` scripts so round-trip equality is preserved.
"""
from __future__ import annotations
from pathlib import Path
from typing import Optional


def load_tsv(raw_dir: Path, name: str) -> list[list[str]]:
    """Load `<raw_dir>/<name>.tsv` and split into rows × cols.

    The TSV is the canonical dump format used by every game in this
    repo (see `dump_excel.py` per-game). One blank trailing line is
    preserved so column-indexing doesn't change.
    """
    text = (Path(raw_dir) / f"{name}.tsv").read_text()
    return [line.split("\t") for line in text.split("\n")]


def num(value) -> Optional[float | int]:
    """Coerce TSV cell text → int (if integral) or float (if decimal).

    Returns None for blank cells / strings / errors so downstream
    callers can skip-or-zero with a single `is None` check.
    """
    if value is None or value == "":
        return None
    try:
        v = float(value)
        return int(v) if v.is_integer() else v
    except (ValueError, TypeError):
        return None


def s(rows: list[list[str]], r: int, c: int) -> str:
    """Safe row × col string fetch — empty string on out-of-bounds."""
    if r < 0 or r >= len(rows) or c < 0 or c >= len(rows[r]):
        return ""
    return rows[r][c]


def n(rows: list[list[str]], r: int, c: int):
    """Safe row × col numeric fetch — None on blank/OOB/non-numeric."""
    return num(s(rows, r, c))


def find_label_row(rows: list[list[str]], label: str, col: int, start: int = 0) -> Optional[int]:
    """Find the first row index where `rows[r][col].strip() == label` (case-sensitive)."""
    for i in range(start, len(rows)):
        if s(rows, i, col).strip() == label:
            return i
    return None


def find_substr_row(rows: list[list[str]], needle: str, start: int = 0) -> Optional[int]:
    """Find first row index where joined row text contains `needle`."""
    for i in range(start, len(rows)):
        joined = "\t".join(rows[i])
        if needle in joined:
            return i
    return None
