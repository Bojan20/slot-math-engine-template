"""W52 — slot-marketplace-verify CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.plugin_marketplace.registry import FilesystemMarketplace
from tools.plugin_marketplace.verifier import MarketplaceVerifier


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-marketplace-verify",
        description="Round-trip publish → download → verify a plugin "
                    "bundle ZIP via a filesystem marketplace registry.",
    )
    p.add_argument("zip", help="path to plugin bundle ZIP")
    p.add_argument("--plugin-id", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--registry-dir", required=True,
                   help="directory to use as the marketplace registry")
    p.add_argument("--download-dir", required=True,
                   help="directory the fetched ZIP is written to")
    p.add_argument("--signature-b64", default=None,
                   help="optional ed25519 signature (base64) to attach")
    p.add_argument("--json", action="store_true", help="print report JSON")
    args = p.parse_args(argv)

    registry = FilesystemMarketplace(root=Path(args.registry_dir))
    verifier = MarketplaceVerifier(registry=registry)
    report = verifier.round_trip(
        Path(args.zip),
        plugin_id=args.plugin_id,
        version=args.version,
        download_dir=Path(args.download_dir),
        signature_b64=args.signature_b64,
    )
    if args.json:
        sys.stdout.write(json.dumps(report.to_dict(), indent=2) + "\n")
    else:
        verdict = "PASS" if report.passed else "FAIL"
        sys.stdout.write(
            f"[marketplace-verify] {verdict} — "
            f"handle={report.publish_handle} "
            f"body_sha_match={report.body_sha_matches} "
            f"manifest_pass={report.manifest_passed} "
            f"tamper={report.tamper_kind}\n"
        )
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
