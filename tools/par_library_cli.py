"""PAR library CLI — Faza 1.7.

Sub-commands:
  add    <file> --game <game> --variant <variant> [--vendor VENDOR]
  list   [--game <game>]
  info   <game> <variant>
  remove <game> <variant>

All variants live under reports/par-library/<game>/<variant>/.
"""
from __future__ import annotations
import argparse
import json
import shutil
import sys
from pathlib import Path
from typing import Optional

# Ensure repo root on path
_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))

from tools.par_normalize.adapters import adapt  # noqa: E402
from tools.par_normalize.audit import audit  # noqa: E402
from tools.par_normalize.detect import detect_format  # noqa: E402

_LIBRARY_ROOT = _REPO_ROOT / "reports" / "par-library"


def _variant_dir(game: str, variant: str) -> Path:
    return _LIBRARY_ROOT / game / variant


def _write_canonical(canonical: dict, dest: Path) -> None:
    dest.write_text(json.dumps(canonical, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


def cmd_add(args: argparse.Namespace) -> int:
    src = Path(args.file)
    if not src.is_file():
        print(f"ERROR: file not found: {src}", file=sys.stderr)
        return 1

    game: str = args.game or src.stem
    variant: str = args.variant or "default"
    vdir = _variant_dir(game, variant)
    vdir.mkdir(parents=True, exist_ok=True)

    # Detect & adapt
    fmt = detect_format(src)
    canonical = adapt(src)
    canonical["meta"]["game_name"] = game
    canonical["meta"]["variant_id"] = variant
    if args.vendor:
        canonical.setdefault("source", {})
        canonical["source"]["vendor"] = args.vendor

    # Audit gate
    report = audit(src, canonical)
    if report["completeness"]:
        print(f"WARNING: completeness issues: {report['completeness']}", file=sys.stderr)

    # Write artifacts
    canonical_path = vdir / "canonical.par.json"
    _write_canonical(canonical, canonical_path)

    merkle_path = vdir / "merkle.sha256"
    if "merkle_root_sha256" in report:
        merkle_path.write_text(report["merkle_root_sha256"] + "\n", encoding="utf-8")

    audit_path = vdir / "audit.json"
    audit_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")

    # Copy original for provenance
    provenance_path = vdir / f"original.{fmt}"
    shutil.copy2(src, provenance_path)

    print(f"ADDED {game}/{variant}")
    print(f"  canonical   → {canonical_path}")
    print(f"  merkle      → {merkle_path}")
    print(f"  audit       → {audit_path}")
    print(f"  original    → {provenance_path}")
    print(f"  lossless    → {'PASS' if report['lossless_pass'] else 'WARN'}")
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    game_filter: Optional[str] = args.game
    if game_filter:
        games = [game_filter] if (_LIBRARY_ROOT / game_filter).is_dir() else []
    else:
        games = sorted([d.name for d in _LIBRARY_ROOT.iterdir() if d.is_dir() and not d.name.startswith("_")])

    if not games:
        print("No games in library.")
        return 0

    for game in games:
        gdir = _LIBRARY_ROOT / game
        variants = sorted([d.name for d in gdir.iterdir() if d.is_dir() and not d.name.startswith("_")])
        print(f"{game}/")
        for variant in variants:
            vdir = gdir / variant
            cpath = vdir / "canonical.par.json"
            mpath = vdir / "merkle.sha256"
            status = "✅" if cpath.exists() and mpath.exists() else "⚠️"
            print(f"  {status} {variant}")
    return 0


def cmd_info(args: argparse.Namespace) -> int:
    game: str = args.game
    variant: str = args.variant
    vdir = _variant_dir(game, variant)
    cpath = vdir / "canonical.par.json"
    if not cpath.exists():
        print(f"ERROR: variant not found: {game}/{variant}", file=sys.stderr)
        return 1

    canonical = json.loads(cpath.read_text(encoding="utf-8"))
    meta = canonical.get("meta", {})
    source = canonical.get("source", {})

    print(f"Game:     {meta.get('game_name', game)}")
    print(f"Variant:  {variant}")
    print(f"RTP:      {meta.get('rtp_target_pct', 'N/A')}%")
    print(f"Volatility: {meta.get('volatility', 'N/A')}")
    print(f"Max win:  {meta.get('max_win_x_bet', 'N/A')}x")
    print(f"Format:   {source.get('format', 'N/A')}")
    print(f"Vendor:   {source.get('vendor', 'N/A')}")
    print(f"Merkle:   {canonical.get('merkle_root_sha256', 'N/A')}")
    return 0


def cmd_remove(args: argparse.Namespace) -> int:
    game: str = args.game
    variant: str = args.variant
    vdir = _variant_dir(game, variant)
    if not vdir.exists():
        print(f"ERROR: variant not found: {game}/{variant}", file=sys.stderr)
        return 1

    shutil.rmtree(vdir)
    print(f"REMOVED {game}/{variant}")
    return 0


def main(argv: Optional[list] = None) -> int:
    parser = argparse.ArgumentParser(prog="slot-math", description="SLOT-MATH PAR library CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    p_add = sub.add_parser("add", help="Add a PAR sheet to the library")
    p_add.add_argument("file", help="Path to PAR file")
    p_add.add_argument("--game", required=False, help="Game identifier")
    p_add.add_argument("--variant", required=False, help="Variant identifier")
    p_add.add_argument("--vendor", required=False, default="generic", help="Vendor name")
    p_add.set_defaults(func=cmd_add)

    p_list = sub.add_parser("list", help="List games / variants")
    p_list.add_argument("--game", required=False, help="Filter by game")
    p_list.set_defaults(func=cmd_list)

    p_info = sub.add_parser("info", help="Show variant details")
    p_info.add_argument("game", help="Game identifier")
    p_info.add_argument("variant", help="Variant identifier")
    p_info.set_defaults(func=cmd_info)

    p_remove = sub.add_parser("remove", help="Remove variant from library")
    p_remove.add_argument("game", help="Game identifier")
    p_remove.add_argument("variant", help="Variant identifier")
    p_remove.set_defaults(func=cmd_remove)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
