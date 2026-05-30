#!/usr/bin/env python3
"""W244 wave 68 — performance regression detector za benchmark dossier.

Compares `reports/acceptance/W244_BENCHMARK_DOSSIER.json` (working tree)
vs `git show HEAD:reports/acceptance/W244_BENCHMARK_DOSSIER.json` (prev
commit). For each bench scenario, computes Δ mean_ns and flags
regressions exceeding threshold.

Usage:
  $ python3 tools/perf_regression_check.py
  $ python3 tools/perf_regression_check.py --threshold 0.10   # 10%
  $ python3 tools/perf_regression_check.py --base origin/main

Exit codes:
  0 — no regression beyond threshold (or no baseline available)
  1 — regression detected → fails CI / pre-commit
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BENCH_REL = "reports/acceptance/W244_BENCHMARK_DOSSIER.json"
BENCH = REPO / BENCH_REL


def _load_records(text: str) -> dict[str, float]:
    """Return {group/bench: mean_ns} from a benchmark JSON string."""
    d = json.loads(text)
    out: dict[str, float] = {}
    for r in d.get("records", []):
        key = f"{r['group']}/{r['bench']}"
        out[key] = float(r["mean_ns"])
    return out


def _load_git_version(rev: str) -> dict[str, float] | None:
    """Read benchmark dossier at git revision; None if missing."""
    try:
        text = subprocess.run(
            ["git", "show", f"{rev}:{BENCH_REL}"],
            capture_output=True, text=True, cwd=str(REPO),
            check=True,
        ).stdout
        return _load_records(text)
    except subprocess.CalledProcessError:
        return None


def main() -> int:
    p = argparse.ArgumentParser(
        description="Detect benchmark perf regressions vs git baseline",
    )
    p.add_argument("--base", default="HEAD",
                   help="Git rev to compare against (default: HEAD)")
    p.add_argument("--threshold", type=float, default=0.10,
                   help="Fractional slowdown threshold (default 0.10 = 10%%)")
    p.add_argument("--verbose", action="store_true")
    args = p.parse_args()

    if not BENCH.exists():
        print(f"[perf-regress] no working benchmark at {BENCH_REL}",
              file=sys.stderr)
        return 0  # nothing to check, not a regression

    current = _load_records(BENCH.read_text())
    baseline = _load_git_version(args.base)

    if baseline is None:
        print(f"[perf-regress] no baseline at {args.base}:{BENCH_REL} "
              "→ first run, no regression possible")
        return 0

    print(f"[perf-regress] comparing working tree vs {args.base}")
    print(f"  threshold:  {args.threshold * 100:.1f}% slowdown\n")
    print(f"{'bench':<45} {'base ns':>10} {'now ns':>10} "
          f"{'Δ%':>8} status")
    print("─" * 80)

    regressions = []
    improvements = []
    same = 0
    for key in sorted(set(current) | set(baseline)):
        b = baseline.get(key)
        c = current.get(key)
        if b is None:
            if args.verbose:
                print(f"{key:<45} {'(new)':>10} {c:>10.1f} "
                      f"{'   —':>8}  NEW")
            continue
        if c is None:
            print(f"{key:<45} {b:>10.1f} {'(gone)':>10} "
                  f"{'   —':>8}  REMOVED")
            continue
        delta = (c - b) / b if b > 0 else 0.0
        marker = ""
        if delta > args.threshold:
            marker = " ✗ REGRESSION"
            regressions.append((key, b, c, delta))
        elif delta < -0.05:
            marker = " ✓ improved"
            improvements.append((key, b, c, delta))
        else:
            same += 1
            if not args.verbose:
                continue
        print(f"{key:<45} {b:>10.1f} {c:>10.1f} "
              f"{delta * 100:>+7.1f}%{marker}")

    print("─" * 80)
    print("\nSummary:")
    print(f"  regressions (>{args.threshold * 100:.0f}%):  "
          f"{len(regressions)}")
    print(f"  improvements (<-5%):  {len(improvements)}")
    print(f"  stable (within ±5%):  {same}")

    if regressions:
        print(f"\n❌ {len(regressions)} regression(s) detected:")
        for key, b, c, d in regressions:
            print(f"   {key}: {b:.1f} → {c:.1f} ns ({d * 100:+.1f}%)")
        return 1

    print(f"\n✅ No regression beyond {args.threshold * 100:.0f}% threshold.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
