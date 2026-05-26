"""CLI entry for slot-multi-territory."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.multi_territory.builder import build_multi_territory_release


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-multi-territory",
        description=(
            "Chain compliance lint + cert v2 + marketplace verify "
            "into one cross-jurisdiction release ZIP."
        ),
    )
    p.add_argument("--ir", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--profile", action="append", default=[],
                   help="jurisdiction profile id; repeat for multiple")
    p.add_argument("--mc-report", type=Path, default=None,
                   help="optional MC report JSON to embed in cert")
    p.add_argument("--profile-search-dir", type=Path, default=None)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    if not args.profile:
        sys.stderr.write("at least one --profile is required\n")
        return 2

    try:
        ir = json.loads(args.ir.read_text())
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to read IR: {e}\n")
        return 2

    mc_report = None
    if args.mc_report:
        try:
            mc_report = json.loads(args.mc_report.read_text())
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"failed to read MC report: {e}\n")
            return 2

    report = build_multi_territory_release(
        ir,
        profile_ids=args.profile,
        out_dir=args.out,
        mc_report=mc_report,
        profile_search_dir=args.profile_search_dir,
    )

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ PASS" if report.passed else "🔴 FAIL"
        sys.stdout.write(
            f"\n[multi-territory] {verdict}  game={report.game_id}  "
            f"profiles={report.n_profiles}  zip={report.out_zip}\n"
            f"  manifest_sha256: {report.manifest_sha256[:16]}…\n"
        )
        for p in report.per_jurisdiction:
            tag = "✅" if p.passed else "🔴"
            sys.stdout.write(
                f"  {tag} {p.profile_id:20s} "
                f"errors={p.n_errors} warnings={p.n_warnings}\n"
            )
        sys.stdout.write(
            f"  cert_xml: {'✅' if report.cert_xml_passed else '🔴'}  "
            f"marketplace: {'✅' if report.marketplace_round_trip_passed else '🔴'}\n"
        )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
