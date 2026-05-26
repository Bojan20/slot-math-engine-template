"""CLI entry for slot-cert-sbom."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.cert_sbom.emitter import build_sbom


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-cert-sbom",
        description=(
            "Emit a CycloneDX 1.4 SBOM over every tools.* module + "
            "console entry-point declared in pyproject.toml."
        ),
    )
    p.add_argument("--repo-root", type=Path, default=None,
                   help="repository root; defaults to CWD")
    p.add_argument("--pyproject", type=Path, default=None)
    p.add_argument("--out", type=Path, required=True,
                   help="output CycloneDX JSON path")
    p.add_argument("--deterministic-serial", action="store_true",
                   help="pin serialNumber to all-zeros UUID for byte-stable output")
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    repo_root = args.repo_root or Path.cwd()
    report = build_sbom(
        repo_root=repo_root,
        pyproject_path=args.pyproject,
        bump_serial=not args.deterministic_serial,
    )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(report.to_cyclonedx(), indent=2, sort_keys=True)
    )

    if not args.quiet:
        sys.stdout.write(
            f"\n[cert-sbom] components={report.n_components}  "
            f"entry_points={len(report.entry_points)}  "
            f"project={report.project_name}@{report.project_version}  "
            f"out={args.out}\n"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
