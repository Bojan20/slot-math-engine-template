"""CLI entry for slot-vendor-onboard."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.vendor_onboard.wizard import run_onboarding


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-vendor-onboard",
        description=(
            "Walk a new vendor through scaffold → synth PAR → IR → "
            "cert in one command. Emits a ready-to-calibrate pilot folder."
        ),
    )
    p.add_argument("vendor_id")
    p.add_argument("--display-name", required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--topology", default="rectangular",
                   choices=["rectangular", "cluster", "ways"])
    p.add_argument("--reels", type=int, default=5)
    p.add_argument("--rows", type=int, default=3)
    p.add_argument("--paylines", type=int, default=25)
    p.add_argument("--feature", action="append", default=[],
                   help="feature kind; repeat for multiple")
    p.add_argument("--target-rtp", type=float, default=0.96)
    p.add_argument("--no-cert", action="store_true",
                   help="skip cert XML emission")
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    features = args.feature or ["free_spins", "wild_expand"]
    report = run_onboarding(
        vendor_id=args.vendor_id,
        display_name=args.display_name,
        out_dir=args.out,
        topology=args.topology,
        reels=args.reels,
        rows=args.rows,
        paylines=args.paylines,
        features=features,
        target_rtp=args.target_rtp,
        emit_cert=not args.no_cert,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ READY" if report.passed else "🔴 BLOCKED"
        sys.stdout.write(
            f"\n[vendor-onboard] {verdict}  vendor={args.vendor_id}  "
            f"out={report.out_dir}\n"
        )
        for s in report.steps:
            tag = "✅" if s.ok else "🔴"
            sys.stdout.write(
                f"  {tag} {s.name:20s} {s.detail}\n"
            )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
