"""CLI entry point.

Usage:
    python3 -m tools.cert_bundle_swid <swid>            # one
    python3 -m tools.cert_bundle_swid all               # all 12
    python3 -m tools.cert_bundle_swid <game> <swid>     # explicit pair

Options:
    --epoch N             pinned timestamp for ZIP entries (default 1700000000)
    --mc-spins N          MC spins per SWID (default 1_000_000)
    --out-dir PATH        output directory (default reports/cert-bundle-swid)
    --private-pem PATH    ed25519 PKCS8 PEM private key (optional override)
    --public-pem PATH     ed25519 SPKI PEM public key (optional override)
    --json                emit machine-readable JSON instead of the table

On success prints one line per SWID:
    <swid> | <bytes> | <sha256-first-16> | <PASS|FAIL>
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.cert_bundle_swid.runner import (
    DEFAULT_EPOCH,
    DEFAULT_MC_SPINS,
    DEFAULT_OUT_DIR,
    GAME_SWIDS,
    SWID_TO_GAME,
    build_all,
    build_bundle_for_swid,
)


def _print_table(results: list[dict]) -> None:
    print(f"{'game':<30} {'swid':<14} {'bytes':>8} {'sha256[:16]':<18} {'verdict':<6}")
    print("-" * 80)
    for r in results:
        sha16 = r["zip_sha256"][:16]
        print(
            f"{r['game']:<30} {r['swid']:<14} {r['zip_bytes']:>8} "
            f"{sha16:<18} {r['acceptance_verdict']:<6}",
        )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="tools.cert_bundle_swid")
    p.add_argument("target", help="`all`, a single SWID, or a game name")
    p.add_argument("swid", nargs="?", default=None,
                   help="optional SWID when first arg is a game name")
    p.add_argument("--epoch", type=int, default=DEFAULT_EPOCH)
    p.add_argument("--mc-spins", type=int, default=DEFAULT_MC_SPINS)
    p.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR)
    p.add_argument("--private-pem", type=Path, default=None)
    p.add_argument("--public-pem", type=Path, default=None)
    p.add_argument("--mc-cache-dir", type=Path, default=None,
                   help="override the MC result cache directory")
    p.add_argument("--json", action="store_true",
                   help="emit JSON instead of a human table")
    args = p.parse_args(argv)

    kw = dict(
        out_dir=args.out_dir, epoch=args.epoch, mc_spins=args.mc_spins,
        private_pem=args.private_pem, public_pem=args.public_pem,
        mc_cache_dir=args.mc_cache_dir,
    )

    if args.target == "all":
        results = build_all(**kw)
    elif args.target in GAME_SWIDS and args.swid:
        results = [build_bundle_for_swid(args.target, args.swid, **kw)]
    elif args.target in SWID_TO_GAME:
        game = SWID_TO_GAME[args.target]
        results = [build_bundle_for_swid(game, args.target, **kw)]
    elif args.target in GAME_SWIDS:
        results = [
            build_bundle_for_swid(args.target, swid, **kw)
            for swid in GAME_SWIDS[args.target]
        ]
    else:
        print(f"unknown target: {args.target}", file=sys.stderr)
        print(f"valid SWIDs: {sorted(SWID_TO_GAME)}", file=sys.stderr)
        return 2

    if args.json:
        print(json.dumps(results, indent=2, sort_keys=True))
    else:
        _print_table(results)

    failed = [r for r in results if not r["acceptance_pass"]]
    # Per spec: don't fail the CLI on acceptance failure — record and report.
    # Return non-zero only on infra error (caught above).
    if failed:
        print(
            f"NOTE: {len(failed)}/{len(results)} SWID(s) did NOT pass the "
            f"acceptance gate (recorded in each acceptance.json).",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
