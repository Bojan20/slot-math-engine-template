"""W77 / P7.5 — slot-public-benchmark CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.public_benchmark.benchmark import build_benchmark, emit_benchmark


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-public-benchmark",
        description="Head-to-head benchmark of our shipped templates "
                    "vs published commercial slot studios.",
    )
    p.add_argument("games_root")
    p.add_argument("--out", required=True)
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    report = build_benchmark(Path(args.games_root))
    paths = emit_benchmark(report, Path(args.out))
    if args.json:
        sys.stdout.write(json.dumps(report.to_dict(), indent=2) + "\n")
    else:
        s = report.summary
        bands = s.get("bands") or {}
        sys.stdout.write(
            f"[public-benchmark] templates={s.get('n_templates', 0)} "
            f"green={bands.get('green', 0)} "
            f"yellow={bands.get('yellow', 0)} "
            f"red={bands.get('red', 0)} "
            f"mean_speedup={s.get('mean_speedup_x', 0):,.0f}x\n"
        )
        for k, v in paths.items():
            sys.stdout.write(f"  {k}: {v}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
