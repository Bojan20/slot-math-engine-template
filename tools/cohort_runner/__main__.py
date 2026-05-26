"""CLI entry for slot-cohort-sim.

Example:
    slot-cohort-sim games/ \\
        --players 500 --spins 1000 --bankroll 200 \\
        --json reports/cohort.json --markdown reports/cohort.md
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.cohort_runner.runner import run_portfolio_cohort


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-cohort-sim",
        description=(
            "Multi-IR engine-free cohort simulation runner. Synthetic "
            "payout sampler matched to each IR's Bernoulli RTP + hit "
            "frequency. Reports bust rate, time-to-bust, end-bankroll, "
            "measured RTP per IR."
        ),
    )
    p.add_argument("games_root", type=Path)
    p.add_argument("--players", type=int, default=500)
    p.add_argument("--spins", type=int, default=1000)
    p.add_argument("--bankroll", type=float, default=200.0)
    p.add_argument("--bet", type=float, default=1.0)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--target-rtp", type=float, default=0.95,
                   help="default RTP for IRs missing rtp_estimate")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--markdown", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    report = run_portfolio_cohort(
        args.games_root,
        players=args.players,
        max_spins=args.spins,
        starting_bankroll=args.bankroll,
        bet_unit=args.bet,
        seed=args.seed,
        target_rtp_default=args.target_rtp,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2,
                                        sort_keys=True))
    if args.markdown:
        args.markdown.parent.mkdir(parents=True, exist_ok=True)
        args.markdown.write_text(report.to_markdown())

    if not args.quiet:
        sys.stdout.write(
            f"\n[cohort-sim] {len(report.results)} IR(s) simulated · "
            f"{args.players} players × {args.spins} spins each\n"
        )
        for r in report.results:
            mb = "—" if r.median_spins_to_bust is None else f"{r.median_spins_to_bust:.0f}"
            sys.stdout.write(
                f"  {r.rel_path:50s} bust={r.bust_rate*100:5.1f}% "
                f"med→bust={mb}  end={r.median_end_bankroll_pct:5.1f}%  "
                f"rtp={r.measured_rtp:.4f}\n"
            )

    return 0 if report.results else 1


if __name__ == "__main__":
    raise SystemExit(main())
