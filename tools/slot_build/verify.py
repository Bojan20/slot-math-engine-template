"""W5.5 — Auto MC verify CI gate.

Post-build verification that the universal slot-sim IR converges to Excel
target metrics within a tolerance threshold. Designed as a CI gate:

  ▸ runs `slot-sim` on every game IR in a directory (or explicit list)
  ▸ compares RTP / hit-freq / win-freq vs Excel target embedded in IR
  ▸ emits a JSON report with per-game pass/fail + overall verdict
  ▸ exits non-zero if any game exceeds threshold

Usage:
    python -m tools.slot_build.verify <ir_dir> [options]
    python -m tools.slot_build.verify --games game1.ir.json game2.ir.json ...

Default behavior matches `scripts/ci_mc_verify.sh`: 1M spins per game,
seed=42, threshold=0.05 (5 % absolute drift acceptable in CI). The 1B
spins / 0.05 % gate from SLOT_ENGINE_MASTER_TODO is the production
"nightly" pass — controlled by `--spins 1000000000 --threshold 0.0005`.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any

from tools.slot_build.__main__ import run_mc, compare_drift, find_slot_sim_binary


# ─── Default thresholds (CI tier matrix) ─────────────────────────────────────
# `quick`    CI tier (PR gate): 1M spins, 5 % threshold (catches gross breaks)
# `standard` CI tier (nightly):  100M spins, 0.5 % threshold (catches medium drift)
# `strict`   cert tier (weekly): 1B spins, 0.05 % threshold (Excel parity)

CI_TIERS = {
    "quick":    {"spins":   1_000_000, "threshold": 0.05},
    "standard": {"spins": 100_000_000, "threshold": 0.005},
    "strict":   {"spins": 1_000_000_000, "threshold": 0.0005},
}


def _iter_universal_ir_files(roots: list[Path]) -> list[Path]:
    """Find every `*.slot-sim.ir.json` under the given roots."""
    out: list[Path] = []
    for root in roots:
        p = Path(root)
        if p.is_file() and p.name.endswith(".slot-sim.ir.json"):
            out.append(p)
        elif p.is_dir():
            out.extend(sorted(p.rglob("*.slot-sim.ir.json")))
    return out


def _load_per_ir_tolerance(ir_path: Path) -> float | None:
    """Read `meta.mc_tolerance` override from the IR JSON (if present).

    Allows individual games to declare a known-residual tolerance that
    relaxes the CI tier threshold for that specific IR — useful while
    a vendor-family gap is being closed (e.g. L&W W4.5-W4.9 stack
    has 0.6 % residual until a deeper FS calibration lands). Returns
    None when the IR doesn't declare an override.
    """
    try:
        with open(ir_path) as f:
            ir = json.load(f)
    except Exception:
        return None
    meta = ir.get("meta") or {}
    raw = meta.get("mc_tolerance")
    try:
        return float(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


def verify_one(
    ir_path: Path,
    *,
    spins: int,
    bet_mult: int,
    seed: int,
    threshold: float,
    bin_path: Path,
    verbose: bool = False,
) -> dict[str, Any]:
    """Run MC + compute drift + verdict for one IR file."""
    t0 = time.monotonic()
    try:
        stats = run_mc(ir_path, spins, bet_mult, seed, bin_path)
    except Exception as e:
        return {
            "ir": str(ir_path),
            "ok": False,
            "error": str(e),
            "elapsed_s": time.monotonic() - t0,
        }
    drift = compare_drift(stats)
    # Per-IR tolerance override allows mid-development games to ship
    # alongside calibrated games on the same CI tier.
    per_ir = _load_per_ir_tolerance(ir_path)
    effective_threshold = max(threshold, per_ir) if per_ir is not None else threshold
    failed = {k: v for k, v in drift.items() if v > effective_threshold}
    return {
        "ir": str(ir_path),
        "ok": not failed,
        "spins": stats.get("spins", spins),
        "seed": seed,
        "bet_mult": bet_mult,
        "threshold": threshold,
        "effective_threshold": effective_threshold,
        "per_ir_tolerance_override": per_ir,
        "rtp": stats.get("rtp"),
        "rtp_target": stats.get("rtp_target"),
        "hit_freq": stats.get("hit_freq"),
        "hit_freq_target": stats.get("hit_freq_target"),
        "win_freq": stats.get("win_freq"),
        "win_freq_target": stats.get("win_freq_target"),
        "drift": drift,
        "failed_metrics": failed,
        "elapsed_s": round(time.monotonic() - t0, 2),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-build-verify",
        description="W5.5 — Auto MC verify CI gate.",
    )
    ap.add_argument(
        "roots",
        nargs="*",
        help="Directories (recursively scanned for *.slot-sim.ir.json) or explicit IR files",
    )
    ap.add_argument(
        "--games", action="append", default=[],
        help="Alias for positional roots (repeatable).",
    )
    ap.add_argument(
        "--tier", choices=list(CI_TIERS.keys()), default="quick",
        help="Preset spins + threshold (quick=1M/5%%, standard=100M/0.5%%, strict=1B/0.05%%)",
    )
    ap.add_argument("--spins", type=int, default=None, help="Override tier spins")
    ap.add_argument(
        "--threshold", type=float, default=None,
        help="Override tier threshold (absolute drift; max(|metric - target|))",
    )
    ap.add_argument("--bet-mult", type=int, default=1, help="Bet multiplier (default 1)")
    ap.add_argument("--seed", type=int, default=42, help="MC seed (default 42)")
    ap.add_argument(
        "--report", default=None,
        help="Path to JSON report file (default: stdout-only)",
    )
    ap.add_argument(
        "--fail-fast", action="store_true",
        help="Exit on first failure instead of running every game",
    )
    ap.add_argument("--quiet", action="store_true", help="Suppress per-game progress logs")
    args = ap.parse_args(argv)

    tier_defaults = CI_TIERS[args.tier]
    spins = args.spins if args.spins is not None else tier_defaults["spins"]
    threshold = args.threshold if args.threshold is not None else tier_defaults["threshold"]

    roots = [Path(r) for r in list(args.roots) + list(args.games)]
    if not roots:
        ap.error("at least one IR file or directory is required")

    ir_files = _iter_universal_ir_files(roots)
    if not ir_files:
        print(f"error: no *.slot-sim.ir.json files found under {roots}", file=sys.stderr)
        return 2

    bin_path = find_slot_sim_binary()
    if bin_path is None:
        print(
            "error: slot-sim binary not found. Build it with `cargo build --release` "
            "in engine/slot-sim/, or set $SLOT_SIM_BIN.",
            file=sys.stderr,
        )
        return 2

    if not args.quiet:
        print(f"[verify] tier={args.tier} spins={spins:,} threshold={threshold} games={len(ir_files)}")

    results: list[dict[str, Any]] = []
    overall_ok = True
    for ir_path in ir_files:
        if not args.quiet:
            print(f"  ▸ {ir_path.name} …", end="", flush=True)
        r = verify_one(
            ir_path,
            spins=spins,
            bet_mult=args.bet_mult,
            seed=args.seed,
            threshold=threshold,
            bin_path=bin_path,
            verbose=not args.quiet,
        )
        results.append(r)
        if r["ok"]:
            if not args.quiet:
                rtp = r.get("rtp")
                rtp_str = f"RTP={rtp:.5f}" if rtp is not None else "(no RTP)"
                print(f" ✅ {rtp_str}  elapsed={r['elapsed_s']:.1f}s")
        else:
            overall_ok = False
            if not args.quiet:
                err = r.get("error")
                if err:
                    print(f" ❌ ERROR: {err[:120]}")
                else:
                    failed_descr = ", ".join(
                        f"{k}={v:+.4f}>{threshold:+.4f}" for k, v in r["failed_metrics"].items()
                    )
                    print(f" ❌ drift exceeds threshold ({failed_descr})  elapsed={r['elapsed_s']:.1f}s")
            if args.fail_fast:
                break

    report = {
        "tier": args.tier,
        "spins": spins,
        "threshold": threshold,
        "bet_mult": args.bet_mult,
        "seed": args.seed,
        "overall_ok": overall_ok,
        "game_count": len(results),
        "pass_count": sum(1 for r in results if r["ok"]),
        "fail_count": sum(1 for r in results if not r["ok"]),
        "results": results,
    }
    if args.report:
        Path(args.report).write_text(json.dumps(report, indent=2, ensure_ascii=False))
        if not args.quiet:
            print(f"[report] {args.report}")

    if not args.quiet:
        verdict = "✅ PASS" if overall_ok else "❌ FAIL"
        print(
            f"\n{verdict}  "
            f"{report['pass_count']}/{report['game_count']} games within "
            f"threshold {threshold} on {args.tier} tier ({spins:,} spins)"
        )
    return 0 if overall_ok else 1


if __name__ == "__main__":
    sys.exit(main())
