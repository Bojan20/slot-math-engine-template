"""W78 / P7.6 — slot-contribute CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.community_contribute.flow import (
    StarterParams,
    bootstrap_contribution,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-contribute",
        description="Bootstrap a community contribution folder: "
                    "starter IR + cert XML stub + PR description + "
                    "CONTRIBUTING.md + meta JSON.",
    )
    p.add_argument("--out", required=True, help="parent output directory")
    p.add_argument("--template-id", required=True)
    p.add_argument("--contributor", default="anonymous")
    p.add_argument("--title", default="")
    p.add_argument("--target-rtp", type=float, default=0.96)
    p.add_argument("--volatility", default="medium",
                   choices=("low", "medium", "high", "ultra"))
    p.add_argument("--reels", type=int, default=5)
    p.add_argument("--rows", type=int, default=3)
    p.add_argument("--paylines", type=int, default=20)
    p.add_argument("--feature", action="append", default=[])
    p.add_argument("--summary", default="")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    params = StarterParams(
        template_id=args.template_id,
        contributor=args.contributor,
        title=args.title,
        target_rtp=args.target_rtp,
        volatility=args.volatility,
        reels=args.reels,
        rows=args.rows,
        paylines=args.paylines,
        features=list(args.feature),
        summary=args.summary,
    )
    pkg = bootstrap_contribution(Path(args.out), params)
    if args.json:
        sys.stdout.write(json.dumps(pkg.to_dict(), indent=2) + "\n")
    else:
        sys.stdout.write(f"[contribute] bootstrapped at {pkg.out_dir}\n")
        for k, v in pkg.to_dict().items():
            if k == "out_dir":
                continue
            sys.stdout.write(f"  {k}: {v}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
