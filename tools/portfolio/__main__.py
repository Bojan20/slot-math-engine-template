"""CLI entry for slot-portfolio.

Example:
    slot-portfolio games/ \\
        --json reports/portfolio.json \\
        --markdown reports/portfolio.md \\
        --html reports/portfolio.html

Exit codes:
    0 — at least one IR was analyzed (even partially)
    1 — no IRs discovered (empty portfolio)
    2 — every discovered IR errored
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.portfolio.analyzer import analyze_portfolio


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-portfolio",
        description=(
            "Multi-IR portfolio analyzer: aggregates RTP / volatility "
            "/ feature coverage / topology mix across every IR under "
            "a games directory; emits JSON + Markdown + HTML dashboard."
        ),
    )
    p.add_argument("games_root", type=Path,
                   help="root to scan (recursively)")
    p.add_argument("--glob", action="append", default=None,
                   help="repeatable; override default IR globs")
    p.add_argument("--ir", action="append", type=Path, default=None,
                   help="repeatable; explicit IR paths (skip discovery)")
    p.add_argument("--json", type=Path, default=None,
                   help="write JSON report to this path")
    p.add_argument("--markdown", type=Path, default=None,
                   help="write Markdown report to this path")
    p.add_argument("--html", type=Path, default=None,
                   help="write HTML dashboard to this path")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = analyze_portfolio(
        args.games_root,
        globs=args.glob,
        explicit_paths=args.ir,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2,
                                        sort_keys=True))
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(report.to_markdown())
    if args.html:
        args.html.parent.mkdir(parents=True, exist_ok=True)
        args.html.write_text(report.to_html())

    if not args.quiet:
        front = report.pareto_frontier()
        sys.stdout.write(
            f"\n[portfolio] {report.total_irs} IR(s) analyzed · "
            f"pareto frontier {len(front)} · "
            f"topologies {dict(report.topology_counts)} · "
            f"vendors {dict(report.vendor_counts)}\n"
        )
        for m in report.metrics:
            tag = "★" if m in front else " "
            rtp = "—" if m.rtp_estimate is None else f"{m.rtp_estimate:.4f}"
            vol = "—" if m.volatility_proxy is None else f"{m.volatility_proxy:.2f}"
            sys.stdout.write(
                f"  {tag} {m.rel_path:50s} rtp={rtp}  vol={vol}\n"
            )

    if report.total_irs == 0:
        return 1
    if all(m.error for m in report.metrics):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
