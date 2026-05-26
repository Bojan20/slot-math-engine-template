"""CLI entry for slot-synthetic-log."""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from tools.synthetic_log_gen.generator import GeneratorConfig, generate_jsonl


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-synthetic-log",
        description=(
            "Generate a synthetic JSONL spin log calibrated to target "
            "RTP + volatility + cohort mix."
        ),
    )
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--players", type=int, default=30)
    p.add_argument("--spins-per-player", type=int, default=100)
    p.add_argument("--target-rtp", type=float, default=0.96)
    p.add_argument("--cv", type=float, default=2.5)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    cfg = GeneratorConfig(
        n_players=args.players,
        spins_per_player=args.spins_per_player,
        target_rtp=args.target_rtp,
        cv=args.cv,
        seed=args.seed,
    )
    n = generate_jsonl(cfg, args.out)
    if not args.quiet:
        sys.stdout.write(
            f"\n[synthetic-log] wrote {n} events to {args.out}  "
            f"target_rtp={args.target_rtp:.4f}  cv={args.cv:.2f}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
