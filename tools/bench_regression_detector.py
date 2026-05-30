"""W244 wave 68 — perf regression detector.

Compares trenutni `reports/acceptance/W244_BENCHMARK_DOSSIER.json` vs
git HEAD verziju i alert-uje ako bilo koji bench mean_ns padne preko
default-nog 10 % threshold-a (configurable).

Strategija:
  • Učita trenutni dossier sa diska
  • Učita prethodni iz `git show HEAD:reports/acceptance/W244_BENCHMARK_DOSSIER.json`
  • Per-bench comparison (group + bench-name composite key)
  • Output: list regression hit-ova (current/baseline > 1 + threshold)

Pure stdlib (subprocess + json). Used in CI sa exit code:
  0 = clean (svi bench-ovi unutar threshold-a)
  1 = bilo koja regression detektovana
  2 = error (missing dossier, parse fail)

Run:  python -m tools.bench_regression_detector
Run:  python -m tools.bench_regression_detector --threshold 0.05
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

REPO = Path(__file__).resolve().parent.parent
DOSSIER = REPO / "reports" / "acceptance" / "W244_BENCHMARK_DOSSIER.json"


@dataclass(frozen=True)
class BenchRecord:
    """One bench point — derived from dossier `records[]` entry."""
    group: str
    bench: str
    mean_ns: float
    ops_per_sec: float

    @property
    def key(self) -> str:
        return f"{self.group}/{self.bench}"


@dataclass(frozen=True)
class Regression:
    """One detected regression: current is slower than baseline by > threshold."""
    bench_key: str
    baseline_mean_ns: float
    current_mean_ns: float
    pct_slower: float
    threshold_pct: float


def _records_from_dossier(payload: dict) -> Iterator[BenchRecord]:
    for r in payload.get("records", []):
        yield BenchRecord(
            group=str(r["group"]),
            bench=str(r["bench"]),
            mean_ns=float(r["mean_ns"]),
            ops_per_sec=float(r.get("ops_per_sec", 0.0)),
        )


def load_current(path: Path = DOSSIER) -> list[BenchRecord]:
    """Load `W244_BENCHMARK_DOSSIER.json` from disk."""
    if not path.exists():
        raise FileNotFoundError(f"dossier not found: {path}")
    payload = json.loads(path.read_text())
    return list(_records_from_dossier(payload))


def load_baseline_from_git(
    ref: str = "HEAD",
    rel_path: str = "reports/acceptance/W244_BENCHMARK_DOSSIER.json",
) -> list[BenchRecord] | None:
    """Load baseline dossier from git ref. Returns None if file is missing
    at that ref (e.g. first commit of dossier — no baseline to compare against).
    """
    try:
        out = subprocess.run(
            ["git", "show", f"{ref}:{rel_path}"],
            cwd=str(REPO),
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return None
    if out.returncode != 0:
        return None
    try:
        payload = json.loads(out.stdout)
    except json.JSONDecodeError:
        return None
    return list(_records_from_dossier(payload))


def detect_regressions(
    current: list[BenchRecord],
    baseline: list[BenchRecord],
    threshold: float = 0.10,
) -> list[Regression]:
    """For each (group, bench) present in BOTH lists, compute
    pct_slower = (current.mean_ns - baseline.mean_ns) / baseline.mean_ns.
    Flag if pct_slower > threshold.
    """
    if threshold < 0:
        raise ValueError(f"threshold must be ≥ 0, got {threshold}")
    baseline_idx = {r.key: r for r in baseline}
    out: list[Regression] = []
    for cur in current:
        base = baseline_idx.get(cur.key)
        if base is None:
            # Bench new in current run — no baseline to compare against.
            continue
        if base.mean_ns <= 0:
            continue
        pct = (cur.mean_ns - base.mean_ns) / base.mean_ns
        if pct > threshold:
            out.append(Regression(
                bench_key=cur.key,
                baseline_mean_ns=base.mean_ns,
                current_mean_ns=cur.mean_ns,
                pct_slower=pct,
                threshold_pct=threshold,
            ))
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="bench-regression-detector",
        description=(
            "Compare current vs HEAD W244 benchmark dossier; "
            "exit 1 if any bench is > threshold slower."
        ),
    )
    p.add_argument(
        "--threshold",
        type=float,
        default=0.10,
        help="fractional slowdown that counts as regression (default 0.10 = 10 pct)",
    )
    p.add_argument(
        "--baseline-ref",
        default="HEAD",
        help="git ref to load baseline dossier from (default HEAD)",
    )
    p.add_argument(
        "--quiet",
        action="store_true",
        help="suppress human-readable output (CI machine-friendly)",
    )
    p.add_argument(
        "--json-out",
        type=Path,
        default=None,
        help="optional path to write regression list as JSON",
    )
    args = p.parse_args(argv)

    try:
        current = load_current()
    except FileNotFoundError as exc:
        sys.stderr.write(f"[bench-regression] {exc}\n")
        return 2
    except json.JSONDecodeError as exc:
        sys.stderr.write(f"[bench-regression] dossier parse failed: {exc}\n")
        return 2

    baseline = load_baseline_from_git(ref=args.baseline_ref)
    if baseline is None:
        if not args.quiet:
            sys.stdout.write(
                f"[bench-regression] no baseline at git ref {args.baseline_ref!r} "
                f"(first commit of dossier or missing file) — skipping\n"
            )
        return 0

    regressions = detect_regressions(current, baseline, threshold=args.threshold)

    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(
            {
                "threshold": args.threshold,
                "baseline_ref": args.baseline_ref,
                "regression_count": len(regressions),
                "regressions": [
                    {
                        "bench": r.bench_key,
                        "baseline_mean_ns": r.baseline_mean_ns,
                        "current_mean_ns": r.current_mean_ns,
                        "pct_slower": r.pct_slower,
                    }
                    for r in regressions
                ],
            },
            indent=2, sort_keys=True,
        ))

    if not regressions:
        if not args.quiet:
            sys.stdout.write(
                f"[bench-regression] ✅ no regression (compared {len(current)} "
                f"benches vs {args.baseline_ref}, threshold {args.threshold:.1%})\n"
            )
        return 0

    if not args.quiet:
        sys.stdout.write(
            f"[bench-regression] 🔴 {len(regressions)} regression(s) detected "
            f"(threshold {args.threshold:.1%}):\n"
        )
        for r in regressions:
            sys.stdout.write(
                f"  {r.bench_key}:  baseline {r.baseline_mean_ns:.1f} ns  "
                f"→ current {r.current_mean_ns:.1f} ns  "
                f"({r.pct_slower:+.1%})\n"
            )
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
