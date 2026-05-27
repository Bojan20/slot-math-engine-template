"""PHASE 15 — `slot-crypto-fair` CLI.

Subcommands:
    commit                          → emit (commit_hash, server_seed_hex)
    verify <commit> <reveal>        → exit 0 if pre-image matches, 1 if not
    derive <server> <client> <nonce> → print derived spin seed (int)
"""

from __future__ import annotations

import argparse
import json
import sys

from tools.crypto_fair.fair_chain import (
    commit_server_seed,
    derive_spin_seed,
    verify_server_seed,
)


def cmd_commit(args: argparse.Namespace) -> int:
    commit, seed = commit_server_seed(n_bytes=args.bytes)
    out = {"commit_hash": commit, "server_seed_hex": seed}
    if args.json:
        print(json.dumps(out, indent=2))
    else:
        print(f"commit: {commit}")
        print(f"server_seed: {seed}")
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    ok = verify_server_seed(args.commit, args.reveal)
    if args.quiet:
        return 0 if ok else 1
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


def cmd_derive(args: argparse.Namespace) -> int:
    seed = derive_spin_seed(args.server, args.client, args.nonce)
    if args.json:
        print(json.dumps({"spin_seed": seed}))
    else:
        print(seed)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-crypto-fair",
        description="PHASE 15 — provably-fair commit/reveal CLI.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_commit = sub.add_parser("commit", help="Emit server-seed commit.")
    p_commit.add_argument("--bytes", type=int, default=32,
                          help="Seed length in bytes (default: 32).")
    p_commit.add_argument("--json", action="store_true",
                          help="Emit JSON.")
    p_commit.set_defaults(func=cmd_commit)

    p_verify = sub.add_parser("verify", help="Verify reveal matches commit.")
    p_verify.add_argument("commit", help="Commit hash hex.")
    p_verify.add_argument("reveal", help="Revealed seed hex.")
    p_verify.add_argument("--quiet", action="store_true")
    p_verify.set_defaults(func=cmd_verify)

    p_derive = sub.add_parser("derive", help="Derive per-spin RNG seed.")
    p_derive.add_argument("server", help="Server seed hex.")
    p_derive.add_argument("client", help="Client seed (utf-8).")
    p_derive.add_argument("nonce", type=int, help="Spin nonce (u64).")
    p_derive.add_argument("--json", action="store_true")
    p_derive.set_defaults(func=cmd_derive)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
