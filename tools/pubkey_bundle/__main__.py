"""CLI entry for slot-pubkey-bundle."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.pubkey_bundle.bundle import build_bundle, verify_bundle


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-pubkey-bundle",
        description=(
            "Build / verify a signed registry of marketplace publisher "
            "ed25519 public keys."
        ),
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="build pubkey_bundle.json")
    b.add_argument("--keys-root", type=Path, required=True,
                   help="<keys>/<plugin_id>/<version>/public.pem layout")
    b.add_argument("--out", type=Path, required=True)
    b.add_argument("--master-private", type=Path, default=None,
                   help="optional ed25519 PRIVATE PEM to sign the bundle")
    b.add_argument("--master-public", type=Path, default=None,
                   help="optional ed25519 PUBLIC PEM; recorded as sha256")
    b.add_argument("--quiet", action="store_true")

    v = sub.add_parser("verify", help="verify pubkey_bundle.json")
    v.add_argument("--bundle", type=Path, required=True)
    v.add_argument("--keys-root", type=Path, required=True)
    v.add_argument("--master-public", type=Path, default=None,
                   help="ed25519 PUBLIC PEM to validate bundle signature")
    v.add_argument("--json", type=Path, default=None)
    v.add_argument("--quiet", action="store_true")

    args = p.parse_args(argv)

    if args.cmd == "build":
        report = build_bundle(
            keys_root=args.keys_root,
            out_path=args.out,
            master_private_pem=args.master_private,
            master_public_pem=args.master_public,
        )
        if not args.quiet:
            sys.stdout.write(
                f"\n[pubkey-bundle build] entries={report.n_entries}  "
                f"signed={'yes' if report.bundle_sig_b64 else 'no'}  "
                f"out={args.out}\n"
            )
        return 0

    if args.cmd == "verify":
        rep = verify_bundle(
            bundle_path=args.bundle,
            keys_root=args.keys_root,
            master_public_pem=args.master_public,
        )
        if args.json:
            args.json.parent.mkdir(parents=True, exist_ok=True)
            args.json.write_text(
                json.dumps(rep.to_dict(), indent=2, sort_keys=True)
            )
        if not args.quiet:
            verdict = "✅ VALID" if rep.passed else "🔴 INVALID"
            sys.stdout.write(
                f"\n[pubkey-bundle verify] {verdict}  entries={rep.n_entries}  "
                f"mismatch={rep.n_pubkey_mismatch}  sig={rep.sig_valid}\n"
            )
            for i in rep.issues:
                sys.stdout.write(f"  🔴 {i}\n")
        return 0 if rep.passed else 1

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
