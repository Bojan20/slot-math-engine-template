"""W73 — slot-studio-publish CLI."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.studio_publish.pipeline import publish_studio


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-studio-publish",
        description="End-to-end pipeline: bundle + sign + publish + "
                    "round-trip verify + SBOM + cert-E2E verify.",
    )
    p.add_argument("games_dir", help="directory holding game IR + cert files")
    p.add_argument("--out", required=True, help="staging output directory")
    p.add_argument("--plugin-id", required=True)
    p.add_argument("--version", required=True)
    p.add_argument("--description", default="")
    p.add_argument("--author", default="")
    p.add_argument("--private-pem", type=Path, default=None)
    p.add_argument("--public-pem", type=Path, default=None)
    p.add_argument("--registry-dir", type=Path, default=None)
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

    report = publish_studio(
        Path(args.games_dir),
        out_dir=Path(args.out),
        plugin_id=args.plugin_id,
        version=args.version,
        description=args.description,
        author=args.author,
        private_pem=args.private_pem,
        public_pem=args.public_pem,
        registry_dir=args.registry_dir,
    )
    payload = report.to_dict()
    if args.json:
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    else:
        sys.stdout.write(
            f"[studio-publish] {'PASS' if report.passed else 'FAIL'} — "
            f"{report.plugin_id} v{report.version}\n"
        )
        for s in report.steps:
            sys.stdout.write(f"  - {s.status:5s} · {s.name}: {s.detail}\n")
    return 0 if report.passed else 1


if __name__ == "__main__":
    sys.exit(main())
