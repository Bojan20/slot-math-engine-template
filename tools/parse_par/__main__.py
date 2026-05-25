"""`python -m tools.parse_par` CLI.

Usage:
    python -m tools.parse_par <vendor> <raw_dir> [--out <ir_dir>]
                              [--sheet <name>] [--all-sheets]
                              [--profile-dir <dir>] [--quiet]

Defaults:
    --out      = <raw_dir>/../out
    --sheet    = profile.sheets.main_par  (single-sheet mode)
    --all-sheets : iterate every sheet matching profile.sheet_pattern
                   (regex) or, lacking that, every <raw_dir>/<name>.tsv
                   whose first matching meta cell yields a non-empty SWID
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from .profile import load_profile, list_profiles, PROFILE_DIR
from .core import parse_par
from .to_slot_sim import convert_to_slot_sim_ir


def _iter_sheets(profile, raw_dir: Path, explicit: list[str] | None):
    if explicit:
        for s_ in explicit:
            yield s_
        return
    pattern = profile.data.get("sheet_pattern")
    if pattern:
        import re
        pat = re.compile(pattern)
        for f in sorted(raw_dir.glob("*.tsv")):
            if pat.match(f.stem):
                yield f.stem
        return
    # Default: just main_par
    yield profile.sheets["main_par"]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="slot-parse", description="Universal PAR parser (W4.2)")
    ap.add_argument("vendor", nargs="?", help="vendor id (lw, igt, ...) or path to profile YAML/JSON")
    ap.add_argument("raw_dir", nargs="?", help="directory containing dumped <sheet>.tsv files")
    ap.add_argument("--out", default=None, help="output directory for IR JSON (default: <raw_dir>/../out)")
    ap.add_argument("--sheet", action="append", help="parse specific sheet (repeatable)")
    ap.add_argument("--all-sheets", action="store_true", help="iterate per profile.sheet_pattern or all .tsv")
    ap.add_argument("--profile-dir", help="extra vendor-profile search dir")
    ap.add_argument("--quiet", action="store_true", help="suppress progress logs")
    ap.add_argument("--list-profiles", action="store_true", help="list known vendor profiles and exit")
    ap.add_argument(
        "--emit-slot-sim",
        action="store_true",
        help="ALSO emit <game_id>.<swid>.slot-sim.ir.json (W4.3b adapter)",
    )
    args = ap.parse_args(argv)

    if args.list_profiles:
        print(f"Profile dir: {PROFILE_DIR}")
        for v in list_profiles():
            try:
                p = load_profile(v)
                print(f"  {v:8s}  v{p.data['profile_version']}  {p.display_name}")
            except Exception as e:  # pragma: no cover
                print(f"  {v:8s}  ERROR: {e}")
        return 0

    if not args.vendor or not args.raw_dir:
        ap.error("vendor and raw_dir are required (or use --list-profiles)")
    search_dirs = [Path(args.profile_dir)] if args.profile_dir else None
    profile = load_profile(args.vendor, search_dirs=search_dirs)
    raw_dir = Path(args.raw_dir).resolve()
    if not raw_dir.is_dir():
        print(f"error: raw_dir {raw_dir} does not exist", file=sys.stderr)
        return 2
    out_dir = Path(args.out) if args.out else (raw_dir.parent / "out")
    out_dir.mkdir(parents=True, exist_ok=True)

    explicit = args.sheet if args.sheet else None
    if args.all_sheets and explicit:
        print("error: --all-sheets and --sheet are mutually exclusive", file=sys.stderr)
        return 2
    if args.all_sheets:
        explicit = None
    sheets = list(_iter_sheets(profile, raw_dir, explicit))
    if not sheets:
        print("error: no sheets matched", file=sys.stderr)
        return 2

    written = 0
    for sheet in sheets:
        if not (raw_dir / f"{sheet}.tsv").exists():
            print(f"warn: {sheet}.tsv not found in {raw_dir}, skipping", file=sys.stderr)
            continue
        ir = parse_par(profile, raw_dir, sheet=sheet)
        swid = ir["meta"].get("swid", sheet).strip().replace(" ", "_")
        game_id = profile.data.get("game_id") or profile.vendor
        path = out_dir / f"{game_id}.{swid}.ir.json"
        text = json.dumps(ir, indent=2, ensure_ascii=False, default=str)
        path.write_text(text)
        written += 1
        if not args.quiet:
            print(f"[{profile.vendor}] {sheet} → {path.name} ({len(text):,} bytes, SWID={swid})")

        if args.emit_slot_sim:
            universal = convert_to_slot_sim_ir(ir, profile.vendor)
            ss_path = out_dir / f"{game_id}.{swid}.slot-sim.ir.json"
            ss_text = json.dumps(universal, indent=2, ensure_ascii=False, default=str)
            ss_path.write_text(ss_text)
            if not args.quiet:
                print(
                    f"[{profile.vendor}] {sheet} → {ss_path.name} "
                    f"({len(ss_text):,} bytes, slot-sim universal IR)"
                )
    if not args.quiet:
        print(f"Wrote {written} IR file(s) to {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
