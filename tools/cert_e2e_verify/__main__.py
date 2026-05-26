"""W71 — slot-cert-e2e-verify CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.cert_e2e_verify.verifier import verify_e2e


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-cert-e2e-verify",
        description="Chain every existing verifier (bundle_verify + "
                    "cert_verify + plugin_sign + pubkey_bundle + sbom) "
                    "into one verdict over a cert bundle dir or ZIP.",
    )
    p.add_argument("target", help="directory or ZIP holding cert artifacts")
    p.add_argument("--public-pem", type=Path,
                   help="ed25519 public PEM used to verify ZIP signature")
    p.add_argument("--master-public-pem", type=Path,
                   help="master ed25519 public PEM for pubkey_bundle")
    p.add_argument("--keys-root", type=Path,
                   help="directory holding per-plugin public.pem files")
    p.add_argument("--json", action="store_true")
    p.add_argument("--out", type=Path, help="write JSON report to this file")
    args = p.parse_args(argv)

    report = verify_e2e(
        Path(args.target),
        public_pem=args.public_pem,
        master_public_pem=args.master_public_pem,
        keys_root=args.keys_root,
    )
    payload = report.to_dict()
    if args.out:
        args.out.write_text(json.dumps(payload, indent=2))
    if args.json:
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    else:
        sys.stdout.write(
            f"[cert-e2e-verify] {report.verdict.value.upper()} "
            f"(exit {report.exit_code()})\n"
        )
        for s in report.steps:
            sys.stdout.write(f"  - {s.status:5s} · {s.name}: {s.detail}\n")
            for e in s.errors:
                sys.stdout.write(f"      ERROR: {e}\n")
    return report.exit_code()


if __name__ == "__main__":
    sys.exit(main())
