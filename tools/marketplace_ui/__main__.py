"""CLI entry for slot-marketplace-ui."""
from __future__ import annotations
import argparse
import sys
from pathlib import Path

from tools.marketplace_ui.generator import build_dashboard
from tools.plugin_marketplace.registry import FilesystemMarketplace


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-marketplace-ui",
        description=(
            "Generate a zero-build HTML/JS dashboard for a "
            "FilesystemMarketplace registry."
        ),
    )
    p.add_argument("--registry", type=Path, required=True,
                   help="root of the FilesystemMarketplace registry")
    p.add_argument("--out", type=Path, required=True,
                   help="dashboard output directory")
    p.add_argument("--no-verify", action="store_true",
                   help="skip the round-trip verification pre-compute")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.registry.exists():
        sys.stderr.write(f"registry not found: {args.registry}\n")
        return 2

    registry = FilesystemMarketplace(root=args.registry)
    artifacts = build_dashboard(
        registry, args.out, verify=not args.no_verify,
    )
    if not args.quiet:
        sys.stdout.write(
            f"\n[marketplace-ui] wrote dashboard to {args.out}\n"
            f"  plugins: {artifacts.n_plugins}\n"
            f"  verified ok: {artifacts.n_verified_ok}\n"
            f"  open: {artifacts.index_html}\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
