"""CLI entry for slot-dashboard-livestream."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.dashboard_livestream.livestream import (
    LivestreamConfig,
    run_livestream,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-dashboard-livestream",
        description=(
            "Long-running operator dashboard re-aggregator. Every "
            "--interval seconds the games_root is re-scanned and the "
            "HTML + JSON dashboard is atomically re-emitted."
        ),
    )
    p.add_argument("games_root", type=Path)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--interval", type=float, default=5.0,
                   help="seconds between refreshes")
    p.add_argument("--max-iterations", type=int, default=None,
                   help="stop after N refreshes; default = run forever")
    p.add_argument("--glob", default="*.ir.json")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    config = LivestreamConfig(
        games_root=args.games_root,
        out_dir=args.out,
        interval_seconds=args.interval,
        max_iterations=args.max_iterations,
        glob=args.glob,
    )

    if not args.quiet:
        sys.stdout.write(
            f"\n[dashboard-livestream] games_root={args.games_root}  "
            f"out={args.out}  interval={args.interval}s  "
            f"max_iter={args.max_iterations}\n"
        )

    report = run_livestream(config)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"  iterations={report.n_iterations}  stopped_by={report.stopped_by}\n"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
