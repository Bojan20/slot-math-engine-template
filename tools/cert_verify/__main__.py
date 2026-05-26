"""W56 — slot-cert-verify CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.cert_verify.verifier import (
    CertVerdict,
    verify_cert_xml,
    verify_cert_xml_against_ir,
    verify_cert_xml_signatures,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-cert-verify",
        description="Verify a cert XML (v1 or v2): namespace + required "
                    "sections + optional IR digest cross-check + optional "
                    "ed25519 signature batch verify.",
    )
    p.add_argument("cert", help="path to cert XML")
    p.add_argument("--ir", help="optional IR JSON to cross-check digests")
    p.add_argument("--public-key-pem", help="optional ed25519 public key "
                                            "PEM for signature verify")
    p.add_argument("--json", action="store_true", help="print report JSON")
    args = p.parse_args(argv)

    report = verify_cert_xml(Path(args.cert))
    if args.ir:
        report = verify_cert_xml_against_ir(
            Path(args.cert), Path(args.ir), report=report
        )
    if args.public_key_pem:
        try:
            pem = Path(args.public_key_pem).read_bytes()
            report = verify_cert_xml_signatures(
                Path(args.cert), pem, report=report
            )
        except FileNotFoundError:
            report.errors.append(
                f"public key PEM missing: {args.public_key_pem}"
            )

    if args.json:
        sys.stdout.write(json.dumps(report.to_dict(), indent=2) + "\n")
    else:
        v = report.verdict
        sys.stdout.write(
            f"[cert-verify] {v.value.upper()} — "
            f"schema={report.detected_schema} "
            f"sections={len(report.sections)} "
            f"missing={len(report.missing_sections)} "
            f"ir_digest={report.ir_digest_matches} "
            f"sig={report.signature_verified}\n"
        )
        for e in report.errors:
            sys.stdout.write(f"  ERROR: {e}\n")
        for w in report.warnings:
            sys.stdout.write(f"  WARN:  {w}\n")
    return 0 if report.verdict == CertVerdict.PASS else 1


if __name__ == "__main__":
    sys.exit(main())
