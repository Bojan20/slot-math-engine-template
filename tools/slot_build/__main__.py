"""`python -m tools.slot_build` CLI entry point.

End-to-end: PAR Excel/TSV directory → vendor-shaped IR + slot-sim
universal IR + optional MC sanity run with RTP/hit-freq comparison
against Excel-published targets.

Vendor auto-detect:
    Scans `<input_dir>` filename layout and selects the matching vendor
    profile. L&W games typically ship `PAR-001.tsv`/`Cash Eruption.tsv`;
    IGT games ship `PAR_001.tsv`/`Paylines.tsv`. The --vendor flag
    overrides auto-detect.

Pipeline:
    1. Detect vendor (or read --vendor)
    2. Load vendor profile (YAML)
    3. For each sheet:
       a. parse_par(profile, raw_dir, sheet) → vendor IR JSON
       b. convert_to_slot_sim_ir(parsed, vendor) → universal IR JSON
       c. (optional) slot-sim binary --ir <universal> --spins N → MC stats
       d. Compare MC stats vs ir.meta to flag drift
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

from tools.parse_par.profile import load_profile, list_profiles
from tools.parse_par.core import parse_par
from tools.parse_par.to_slot_sim import convert_to_slot_sim_ir


# ─── vendor auto-detect ──────────────────────────────────────────────────────


VENDOR_SIGNATURES: dict[str, list[str]] = {
    "lw":  ["Cash Eruption.tsv", "PAR-001.tsv", "PAR-002.tsv"],
    "igt": ["PAR_001.tsv", "Paylines.tsv"],
}


def detect_vendor(raw_dir: Path) -> str | None:
    """Heuristic: look for vendor-specific sheet filenames.

    Returns vendor id (lw/igt/...) or None if no signature matches.
    Order matches `VENDOR_SIGNATURES.keys()` — first match wins.
    """
    files = {p.name for p in raw_dir.iterdir() if p.is_file()}
    for vendor, sigs in VENDOR_SIGNATURES.items():
        # Require ≥2 signature files to match (avoid false positives on
        # single-sheet ambiguity).
        hits = sum(1 for s in sigs if s in files)
        if hits >= 2:
            return vendor
    return None


# ─── pipeline ────────────────────────────────────────────────────────────────


def _iter_sheets(profile, raw_dir: Path, explicit: list[str] | None) -> list[str]:
    if explicit:
        return explicit
    pattern = profile.data.get("sheet_pattern")
    if pattern:
        import re
        pat = re.compile(pattern)
        return [f.stem for f in sorted(raw_dir.glob("*.tsv")) if pat.match(f.stem)]
    return [profile.sheets["main_par"]]


def find_slot_sim_binary() -> Path | None:
    """Locate the release build of `slot-sim` for optional MC runs.

    Search order:
      1. `$SLOT_SIM_BIN` env var
      2. `engine/slot-sim/target/release/slot-sim` relative to repo root
      3. `slot-sim` on PATH (system install)
    """
    import os
    env = os.environ.get("SLOT_SIM_BIN")
    if env and Path(env).exists():
        return Path(env)
    repo_root = Path(__file__).resolve().parent.parent.parent
    cand = repo_root / "engine/slot-sim/target/release/slot-sim"
    if cand.exists():
        return cand
    on_path = shutil.which("slot-sim")
    return Path(on_path) if on_path else None


def run_mc(
    ir_path: Path,
    spins: int,
    bet_mult: int,
    seed: int,
    bin_path: Path,
) -> dict[str, Any]:
    """Run slot-sim binary and parse its output into a stats dict."""
    cmd = [
        str(bin_path),
        "--ir", str(ir_path),
        "--spins", str(spins),
        "--bet-mult", str(bet_mult),
        "--seed", str(seed),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        raise RuntimeError(
            f"slot-sim failed (exit {proc.returncode}):\n{proc.stderr[:500]}"
        )
    stats: dict[str, Any] = {}
    for line in proc.stdout.splitlines():
        line = line.strip()
        if line.startswith("RTP:"):
            parts = line.replace("(Excel", "").replace(")", "").split()
            stats["rtp"] = float(parts[1])
            if len(parts) >= 3:
                stats["rtp_target"] = float(parts[2])
        elif line.startswith("Hit freq:"):
            parts = line.replace("(Excel", "").replace(")", "").split()
            stats["hit_freq"] = float(parts[2])
            if len(parts) >= 4:
                stats["hit_freq_target"] = float(parts[3])
        elif line.startswith("Win freq:"):
            parts = line.replace("(Excel", "").replace(")", "").split()
            stats["win_freq"] = float(parts[2])
            if len(parts) >= 4:
                stats["win_freq_target"] = float(parts[3])
        elif line.startswith("Spins:"):
            stats["spins"] = int(line.split()[1])
        elif line.startswith("Elapsed:"):
            stats["elapsed"] = line.split(":", 1)[1].strip()
    return stats


def compare_drift(stats: dict[str, Any]) -> dict[str, float]:
    """Per-metric absolute drift from Excel target (if available)."""
    drift = {}
    for key in ("rtp", "hit_freq", "win_freq"):
        target_key = f"{key}_target"
        if key in stats and target_key in stats:
            drift[key] = abs(stats[key] - stats[target_key])
    return drift


# ─── main ────────────────────────────────────────────────────────────────────


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-build",
        description="End-to-end PAR → IR → MC pipeline (W5.1)",
    )
    ap.add_argument("input_dir", help="directory with raw PAR sheets (.tsv)")
    ap.add_argument("--vendor", default="auto",
                    help="vendor id (lw, igt, ...) or 'auto' (default)")
    ap.add_argument("--sheet", action="append",
                    help="parse specific sheet (repeatable)")
    ap.add_argument("--all-sheets", action="store_true",
                    help="iterate per profile.sheet_pattern or all .tsv")
    ap.add_argument("--out", default=None,
                    help="output directory (default: <input_dir>/../out)")
    ap.add_argument("--mc-spins", type=int, default=1_000_000,
                    help="MC sanity spins (default 1M; 0 disables)")
    ap.add_argument("--bet-mult", type=int, default=1,
                    help="MC bet multiplier (default 1)")
    ap.add_argument("--seed", type=int, default=0xC0DE_BABE,
                    help="MC seed (default 0xC0DEBABE)")
    ap.add_argument("--no-universal", action="store_true",
                    help="skip slot-sim universal IR emission")
    ap.add_argument("--no-mc", action="store_true",
                    help="skip MC sanity run (alias for --mc-spins 0)")
    ap.add_argument("--quiet", action="store_true",
                    help="suppress progress logs")
    args = ap.parse_args(argv)

    raw_dir = Path(args.input_dir).resolve()
    if not raw_dir.is_dir():
        print(f"error: {raw_dir} is not a directory", file=sys.stderr)
        return 2

    vendor = args.vendor
    if vendor == "auto":
        detected = detect_vendor(raw_dir)
        if detected is None:
            available = ", ".join(VENDOR_SIGNATURES.keys())
            print(
                f"error: could not auto-detect vendor for {raw_dir}\n"
                f"  available vendors: {available}\n"
                f"  override with --vendor <id>",
                file=sys.stderr,
            )
            return 2
        vendor = detected
        if not args.quiet:
            print(f"[detect] vendor: {vendor}")

    if vendor not in list_profiles():
        print(
            f"error: unknown vendor {vendor!r} (known: {list_profiles()})",
            file=sys.stderr,
        )
        return 2

    profile = load_profile(vendor)
    out_dir = Path(args.out) if args.out else (raw_dir.parent / "out")
    out_dir.mkdir(parents=True, exist_ok=True)

    explicit = args.sheet if args.sheet else None
    if args.all_sheets and explicit:
        print("error: --all-sheets and --sheet are mutually exclusive", file=sys.stderr)
        return 2
    if args.all_sheets:
        explicit = None
    sheets = _iter_sheets(profile, raw_dir, explicit)
    if not sheets:
        print("error: no sheets matched", file=sys.stderr)
        return 2

    mc_spins = 0 if args.no_mc else args.mc_spins
    bin_path = find_slot_sim_binary() if mc_spins > 0 and not args.no_universal else None
    if mc_spins > 0 and not args.no_universal and bin_path is None:
        print(
            "warn: slot-sim binary not found — skipping MC sanity run "
            "(build it with `cargo build --release` in engine/slot-sim/, "
            "or set $SLOT_SIM_BIN)",
            file=sys.stderr,
        )

    overall_drift: list[dict[str, Any]] = []
    for sheet in sheets:
        if not (raw_dir / f"{sheet}.tsv").exists():
            print(f"warn: {sheet}.tsv not found, skipping", file=sys.stderr)
            continue
        if not args.quiet:
            print(f"\n[{vendor}] parsing {sheet} …")
        ir = parse_par(profile, raw_dir, sheet=sheet)
        swid = ir["meta"].get("swid", sheet).strip().replace(" ", "_")
        game_id = profile.data.get("game_id") or profile.vendor

        # 1. Vendor-shaped IR
        vendor_path = out_dir / f"{game_id}.{swid}.ir.json"
        vendor_path.write_text(json.dumps(ir, indent=2, ensure_ascii=False, default=str))
        if not args.quiet:
            print(f"  → {vendor_path.name} ({vendor_path.stat().st_size:,} bytes)")

        # 2. Universal slot-sim IR
        universal_path = None
        if not args.no_universal:
            try:
                universal = convert_to_slot_sim_ir(ir, vendor)
            except NotImplementedError as e:
                print(f"  warn: skipping universal IR — {e}", file=sys.stderr)
            else:
                universal_path = out_dir / f"{game_id}.{swid}.slot-sim.ir.json"
                universal_path.write_text(
                    json.dumps(universal, indent=2, ensure_ascii=False, default=str)
                )
                if not args.quiet:
                    print(
                        f"  → {universal_path.name} "
                        f"({universal_path.stat().st_size:,} bytes, universal IR)"
                    )

        # 3. MC sanity run
        if mc_spins > 0 and universal_path is not None and bin_path is not None:
            if not args.quiet:
                print(f"  MC: {mc_spins:,} spins @ BM={args.bet_mult} …")
            try:
                stats = run_mc(universal_path, mc_spins, args.bet_mult, args.seed, bin_path)
            except Exception as e:
                print(f"  warn: MC failed: {e}", file=sys.stderr)
                continue
            drift = compare_drift(stats)
            if not args.quiet:
                for k in ("rtp", "hit_freq", "win_freq"):
                    tgt = stats.get(f"{k}_target")
                    val = stats.get(k)
                    d = drift.get(k)
                    if tgt is None or val is None:
                        continue
                    tag = "✅" if (d is None or d < 0.05) else "⚠️"
                    print(f"    {k:9s} {val:.5f}  target {tgt:.5f}  Δ {d:+.5f}  {tag}")
            overall_drift.append({"sheet": sheet, "swid": swid, **stats, **{f"d_{k}": v for k, v in drift.items()}})

    if not args.quiet and overall_drift:
        print("\n[summary]")
        for d in overall_drift:
            rtp_d = d.get("d_rtp")
            hf_d = d.get("d_hit_freq")
            print(
                f"  {d['sheet']:14s} SWID={d['swid']:14s}  "
                f"Δrtp={rtp_d:+.4f}  Δhit={hf_d:+.4f}" if rtp_d is not None and hf_d is not None
                else f"  {d['sheet']:14s} SWID={d['swid']:14s}  (incomplete stats)"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
