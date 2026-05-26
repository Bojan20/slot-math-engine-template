"""W76 / P7.4 — slot-pilot-outreach CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.pilot_outreach.package import (
    OutreachConfig,
    build_outreach_package,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-pilot-outreach",
        description="Bundle a vendor / operator outreach kit (cover "
                    "letter + tech brief + pricing CSV + ZIP) ready to "
                    "ship out of an existing pilot folder.",
    )
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--operator-name", required=True)
    p.add_argument("--operator-contact", default="Slot Operations Team")
    p.add_argument("--game-title", required=True)
    p.add_argument("--template-id", required=True)
    p.add_argument("--swid", default="")
    p.add_argument("--vendor", default="")
    p.add_argument("--topology", default="rectangular")
    p.add_argument("--paylines", type=int, default=20)
    p.add_argument("--target-rtp", type=float, default=None)
    p.add_argument("--volatility", default="medium",
                   choices=("low", "medium", "high", "ultra"))
    p.add_argument("--feature", action="append", default=[],
                   help="repeatable feature kind")
    p.add_argument("--jurisdiction", action="append", default=[],
                   help="repeatable jurisdiction id")
    p.add_argument("--tier", default="BASIC",
                   choices=("FREE", "BASIC", "PREMIUM"))
    p.add_argument("--price-eur", type=int, default=999)
    p.add_argument("--attach", action="append", default=[],
                   help="repeatable existing artifact path to bundle")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    cfg = OutreachConfig(
        operator_name=args.operator_name,
        operator_contact=args.operator_contact,
        game_title=args.game_title,
        template_id=args.template_id,
        swid=args.swid,
        vendor=args.vendor,
        topology=args.topology,
        paylines=args.paylines,
        target_rtp=args.target_rtp,
        volatility=args.volatility,
        features=list(args.feature),
        jurisdictions=list(args.jurisdiction),
        tier=args.tier,
        price_eur=args.price_eur,
    )
    pkg = build_outreach_package(
        Path(args.out),
        cfg,
        attachments=[Path(a) for a in args.attach],
    )
    if args.json:
        sys.stdout.write(json.dumps(pkg.to_dict(), indent=2) + "\n")
    else:
        sys.stdout.write(f"[pilot-outreach] wrote kit to {pkg.out_dir}\n")
        for k, v in pkg.to_dict().items():
            if k == "out_dir":
                continue
            sys.stdout.write(f"  {k}: {v}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
