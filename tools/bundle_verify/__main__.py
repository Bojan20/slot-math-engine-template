"""CLI entry for slot-bundle-verify."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.bundle_verify.verifier import verify_bundle


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-bundle-verify",
        description=(
            "Re-hash a regulator export bundle and verify against manifest."
        ),
    )
    p.add_argument("bundle", type=Path)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not (args.bundle / "manifest.json").exists():
        sys.stderr.write(f"manifest.json not found in {args.bundle}\n")
        return 2

    report = verify_bundle(args.bundle)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ INTACT" if report.passed else "🔴 BROKEN"
        sys.stdout.write(
            f"\n[bundle-verify] {verdict}  bundle={args.bundle}  "
            f"entries={len(report.entries)}  failed={report.n_failed}\n"
        )
        for e in report.entries:
            tag = {"ok": "✅", "mismatch": "🔴", "missing": "❓"}.get(e.status, "?")
            sys.stdout.write(f"  {tag} {e.rel_path}  ({e.status})\n")

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
