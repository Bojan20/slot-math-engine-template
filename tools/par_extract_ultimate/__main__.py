"""CLI: extract a vendor PAR XLSX into the local math-agent corpus.

This wrapper is intentionally chatty about *aggregate stats only* — the
raw cell dumps go straight to disk; STDOUT contains only counts. Designed
so that when Claude Code invokes it via the Bash tool, the orchestrator
context never sees vendor values.

Usage:
    python -m tools.par_extract_ultimate <xlsx_path> --game <game-key> [--corpus <dir>]

Example:
    python -m tools.par_extract_ultimate \\
        ~/Desktop/Bojan/PAR_Sheets_FortKnoxWolfRun.xlsx \\
        --game fort-knox-wolf-run

The output goes to:
    agents/math-agent/corpus/<game-key>/ultimate_extract/

Idempotent: re-running on the same game-key overwrites the previous extract.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from dataclasses import asdict
from pathlib import Path

from .extract import extract_workbook


def _default_corpus_dir() -> Path:
    here = Path(__file__).resolve()
    repo_root = here.parents[2]  # …/tools/par_extract_ultimate/__main__.py
    return repo_root / "agents" / "math-agent" / "corpus"


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Ultimate XLSX → JSON extractor.")
    p.add_argument("xlsx_path", type=Path, help="Path to vendor PAR sheet XLSX")
    p.add_argument("--game", required=True, help="Game key (folder name under corpus/)")
    p.add_argument(
        "--corpus",
        type=Path,
        default=_default_corpus_dir(),
        help="Path to math-agent corpus root (default: repo agents/math-agent/corpus)",
    )
    p.add_argument(
        "--force",
        action="store_true",
        help="Overwrite any existing ultimate_extract/ for this game",
    )
    p.add_argument(
        "--copy-raw",
        action="store_true",
        help="Also copy the source XLSX into <game>/raw/ (gitignored)",
    )
    args = p.parse_args(argv)

    xlsx_path: Path = args.xlsx_path.expanduser().resolve()
    if not xlsx_path.exists():
        print(f"error: file not found: {xlsx_path}", file=sys.stderr)
        return 2
    if not xlsx_path.suffix.lower() in (".xlsx", ".xlsm"):
        print(f"error: not an xlsx file: {xlsx_path}", file=sys.stderr)
        return 2

    corpus_root: Path = args.corpus.expanduser().resolve()
    game_dir = corpus_root / args.game
    out_dir = game_dir / "ultimate_extract"

    if out_dir.exists():
        if not args.force:
            print(f"error: {out_dir} already exists. Pass --force to overwrite.", file=sys.stderr)
            return 3
        shutil.rmtree(out_dir)

    out_dir.mkdir(parents=True, exist_ok=True)
    game_dir.mkdir(parents=True, exist_ok=True)

    print(f"[extract] source: {xlsx_path}")
    print(f"[extract] output: {out_dir}")
    print(f"[extract] starting two-pass parse (formula + value)...", flush=True)

    stats = extract_workbook(xlsx_path, out_dir)

    # Print aggregate-only summary — no raw values leak via stdout.
    print(f"[extract] ✓ workbook:        {stats.workbook}")
    print(f"[extract] ✓ sheets:          {stats.sheet_count}")
    print(f"[extract] ✓ defined names:   {stats.defined_names}")
    print(f"[extract] ✓ total cells:     {stats.total_cells}")
    print(f"[extract] ✓ formulas:        {stats.total_formulas}")
    print(f"[extract] ✓ comments:        {stats.total_comments}")
    print(f"[extract] ✓ hyperlinks:      {stats.total_hyperlinks}")
    print(f"[extract] ✓ output:          {out_dir}")
    for s in stats.sheets:
        print(
            f"           sheet '{s.name}': {s.cells_with_value} val "
            f"/ {s.cells_with_formula} formula / {s.style_records} unique styles "
            f"/ {s.merged_count} merged / {s.table_count} tables / "
            f"{s.chart_count} charts / {s.validation_count} validations"
        )

    if args.copy_raw:
        raw_dir = game_dir / "raw"
        raw_dir.mkdir(parents=True, exist_ok=True)
        target = raw_dir / xlsx_path.name
        shutil.copy2(xlsx_path, target)
        print(f"[extract] ✓ raw copy:        {target}  (gitignored)")

    # Write a per-game pointer manifest noting which workbook was extracted.
    pointer = {
        "game_key": args.game,
        "source_basename": xlsx_path.name,
        "source_sha256_first_64k": _sha256_first_64k(xlsx_path),
        "extraction_dir": str(out_dir.relative_to(corpus_root.parent.parent)),
        "extraction_summary": "ultimate_extract/extraction_summary.json",
    }
    with open(game_dir / "ultimate_extract.pointer.json", "w", encoding="utf-8") as f:
        json.dump(pointer, f, ensure_ascii=False, indent=2)

    print("[extract] done")
    return 0


def _sha256_first_64k(path: Path) -> str:
    import hashlib
    h = hashlib.sha256()
    with open(path, "rb") as f:
        h.update(f.read(64 * 1024))
    return h.hexdigest()


if __name__ == "__main__":
    sys.exit(main())
