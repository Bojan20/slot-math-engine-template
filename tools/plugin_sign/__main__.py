"""CLI entry for slot-plugin-sign."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.plugin_sign.signer import (
    SigningUnavailable,
    generate_keypair,
    sign_zip,
    verify_zip,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-plugin-sign",
        description="ed25519 signing CLI for marketplace plugin ZIPs.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    kg = sub.add_parser("keygen", help="generate a fresh ed25519 keypair")
    kg.add_argument("--out", type=Path, required=True)
    kg.add_argument("--quiet", action="store_true")

    sg = sub.add_parser("sign", help="sign a ZIP and emit .sig + .sig.b64")
    sg.add_argument("zip", type=Path)
    sg.add_argument("--key", type=Path, required=True,
                    help="ed25519 PRIVATE PEM key")
    sg.add_argument("--json", type=Path, default=None)
    sg.add_argument("--quiet", action="store_true")

    vf = sub.add_parser("verify", help="verify a ZIP against its sidecar")
    vf.add_argument("zip", type=Path)
    vf.add_argument("--key", type=Path, required=True,
                    help="ed25519 PUBLIC PEM key")
    vf.add_argument("--sig", type=Path, default=None,
                    help="explicit signature sidecar (defaults to <zip>.sig)")
    vf.add_argument("--json", type=Path, default=None)
    vf.add_argument("--quiet", action="store_true")

    args = p.parse_args(argv)
    try:
        if args.cmd == "keygen":
            priv, pub = generate_keypair(args.out)
            if not args.quiet:
                sys.stdout.write(
                    f"\n[plugin-sign keygen] private={priv} public={pub}\n"
                )
            return 0
        if args.cmd == "sign":
            result = sign_zip(args.zip, private_pem_path=args.key)
            if args.json:
                args.json.parent.mkdir(parents=True, exist_ok=True)
                args.json.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True))
            if not args.quiet:
                sys.stdout.write(
                    f"\n[plugin-sign sign] body_sha256={result.body_sha256}\n"
                    f"  sig: {result.sig_path}\n"
                    f"  sig.b64: {result.sig_b64_path}\n"
                )
            return 0
        if args.cmd == "verify":
            result = verify_zip(
                args.zip, public_pem_path=args.key, sig_path=args.sig,
            )
            if args.json:
                args.json.parent.mkdir(parents=True, exist_ok=True)
                args.json.write_text(json.dumps(result.to_dict(), indent=2, sort_keys=True))
            if not args.quiet:
                verdict = "✅ VALID" if result.passed else "🔴 INVALID"
                sys.stdout.write(
                    f"\n[plugin-sign verify] {verdict}  body_sha256={result.body_sha256}\n"
                )
                if not result.passed:
                    sys.stdout.write(f"  error: {result.error}\n")
            return 0 if result.passed else 1
    except SigningUnavailable as e:
        sys.stderr.write(f"signing unavailable: {e}\n")
        return 2
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
