"""CLI entry for slot-ab-test."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.ab_test.framework import compare_irs


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-ab-test",
        description=(
            "Compare 2 IR variants via synthetic cohort sim + Welch's "
            "t-test on per-player end-bankroll. Engine-free."
        ),
    )
    p.add_argument("ir_a", type=Path)
    p.add_argument("ir_b", type=Path)
    p.add_argument("--players", type=int, default=500)
    p.add_argument("--spins", type=int, default=1000)
    p.add_argument("--bankroll", type=float, default=200.0)
    p.add_argument("--bet", type=float, default=1.0)
    p.add_argument("--target-rtp", type=float, default=0.95)
    p.add_argument("--target-rtp-b", type=float, default=None)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--alpha", type=float, default=0.05)
    p.add_argument("--label-a", default="A")
    p.add_argument("--label-b", default="B")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir_a = json.loads(args.ir_a.read_text())
        ir_b = json.loads(args.ir_b.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IRs: {e}\n")
        return 2

    cmp = compare_irs(
        ir_a, ir_b,
        players=args.players, max_spins=args.spins,
        starting_bankroll=args.bankroll, bet_unit=args.bet,
        target_rtp_a=args.target_rtp,
        target_rtp_b=args.target_rtp_b or args.target_rtp,
        seed=args.seed, alpha=args.alpha,
        label_a=args.label_a, label_b=args.label_b,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(cmp.to_dict(), indent=2,
                                         sort_keys=True))

    if not args.quiet:
        sys.stdout.write(
            f"\n[ab-test] {cmp.verdict.upper()} (p={cmp.p_value:.4f}, "
            f"d={cmp.cohen_d:+.3f}, α={cmp.alpha})\n"
        )
        for v in (cmp.variant_a, cmp.variant_b):
            sys.stdout.write(
                f"  {v.label:6s}  bust={v.bust_rate*100:5.1f}%  "
                f"end={v.mean_end_bankroll_pct:6.2f}%  "
                f"rtp={v.measured_rtp:.4f}\n"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
