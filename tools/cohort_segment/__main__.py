"""CLI entry for slot-cohort-segment."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.cohort_segment.analyzer import analyze_jsonl


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-cohort-segment",
        description=(
            "Segment a JSONL spin log into low/mid/high rollers and "
            "emit per-segment RTP / bust rate / avg session length."
        ),
    )
    p.add_argument("jsonl", type=Path)
    p.add_argument("--bust-threshold", type=float, default=0.0,
                   help="end-balance change considered a bust (default 0)")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--rtp-tolerance", type=float, default=0.02,
                   help="exit 1 if any segment RTP deviates from overall by > this")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.jsonl.exists():
        sys.stderr.write(f"file not found: {args.jsonl}\n")
        return 2

    report = analyze_jsonl(args.jsonl, bust_threshold=args.bust_threshold)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(
            json.dumps(report.to_dict(), indent=2, sort_keys=True)
        )

    overall_bet = sum(s.total_bet for s in report.segments.values())
    overall_pay = sum(s.total_pay for s in report.segments.values())
    overall_rtp = overall_pay / overall_bet if overall_bet > 0 else 0.0

    if not args.quiet:
        sys.stdout.write(
            f"\n[cohort-segment] events={report.n_events}  "
            f"overall_rtp={overall_rtp:.4f}\n"
        )
        for s_name in ("low", "mid", "high"):
            s = report.segments[s_name]
            sys.stdout.write(
                f"  {s_name:5s}  n={s.n_players:4d}  spins={s.total_spins:6d}  "
                f"rtp={s.rtp:.4f}  bust={s.bust_rate*100:5.1f}%\n"
            )

    deviation = max(
        (abs(s.rtp - overall_rtp) for s in report.segments.values() if s.n_players),
        default=0.0,
    )
    return 0 if deviation <= args.rtp_tolerance else 1


if __name__ == "__main__":
    raise SystemExit(main())
