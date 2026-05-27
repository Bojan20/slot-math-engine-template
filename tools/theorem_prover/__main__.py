"""PHASE 19 — `slot-prove` CLI."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from tools.theorem_prover.prover import (
    prove,
    parse_claim,
    verify_certificate,
    cert_to_dict,
    ProofCertificate,
)


def cmd_prove(args: argparse.Namespace) -> int:
    ir_path = Path(args.ir)
    if not ir_path.exists():
        print(f"error: ir not found: {ir_path}", file=sys.stderr)
        return 2
    ir = json.loads(ir_path.read_text())
    try:
        claim = parse_claim(args.claim)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    cert = prove(ir, claim)
    d = cert_to_dict(cert)

    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(json.dumps(d, indent=2))

    if args.json:
        print(json.dumps(d, indent=2))
    elif not args.quiet:
        print(f"[slot-prove] {cert.status}")
        print(f"  claim:  {args.claim}")
        print(f"  prover: {cert.prover}")
        print(f"  ir_hash: {cert.ir_hash_hex}")
        for k, v in cert.evidence.items():
            print(f"    {k}: {v}")
        if args.out:
            print(f"  cert saved: {args.out}")

    if cert.status.startswith("refuted"):
        return 1
    if cert.status in ("unknown", "engine_absent"):
        return 3
    return 0


def cmd_verify(args: argparse.Namespace) -> int:
    ir = json.loads(Path(args.ir).read_text())
    cert_data = json.loads(Path(args.cert).read_text())
    cert = ProofCertificate(**cert_data)
    ok = verify_certificate(ir, cert)
    if not args.quiet:
        print("PASS" if ok else "FAIL")
    return 0 if ok else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-prove",
        description="PHASE 19 — Slot Math Theorem Prover.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_prove = sub.add_parser("prove", help="Emit a proof certificate.")
    p_prove.add_argument("--ir", required=True)
    p_prove.add_argument("--claim", required=True,
                          help="e.g. 'rtp_upper_bound:0.97' or 'paytable_consistency'")
    p_prove.add_argument("--out", help="Persist cert JSON.")
    p_prove.add_argument("--json", action="store_true")
    p_prove.add_argument("--quiet", action="store_true")
    p_prove.set_defaults(func=cmd_prove)

    p_verify = sub.add_parser("verify", help="Offline re-verify a cert.")
    p_verify.add_argument("--ir", required=True)
    p_verify.add_argument("--cert", required=True)
    p_verify.add_argument("--quiet", action="store_true")
    p_verify.set_defaults(func=cmd_verify)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
