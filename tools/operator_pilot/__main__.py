"""CLI entry for slot-operator-pilot.

Example:
    slot-operator-pilot path/to/ir.json \\
        --jurisdiction ukgc --jurisdiction mga \\
        --out dist/pilot/my-game/ \\
        --raw games/my-game/raw/ \\
        --mc games/my-game/reports/mc.json

Exit codes:
    0  — every step passed (PilotReport.passed = True)
    1  — at least one step failed (e.g. lint violation, missing cert)
    2  — IR load failed (orchestrator aborted before step chain)
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.operator_pilot.orchestrator import (
    PilotConfig,
    run_pilot,
)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-operator-pilot",
        description=(
            "End-to-end operator pilot package: jurisdiction lint + "
            "cert XML + signed cert ZIP + consolidated manifest + "
            "single operator-package.zip ready for regulator hand-off."
        ),
    )
    p.add_argument("ir_path", type=Path, help="universal IR JSON path")
    p.add_argument("--out", type=Path, required=True,
                   help="output directory for artifacts")
    p.add_argument("--jurisdiction", action="append", default=None,
                   metavar="ID",
                   help="repeatable; jurisdiction profile id "
                        "(ukgc, mga, gli16, gli19, nv, nj, pa, mi, "
                        "on, bc, aams, quebec)")
    p.add_argument("--raw", type=Path, default=None,
                   help="original PAR raw dir for commitment hashes")
    p.add_argument("--mc", type=Path, default=None,
                   help="pre-existing MC report JSON to embed")
    p.add_argument("--no-xml", action="store_true",
                   help="skip regulator XML emit")
    p.add_argument("--no-zip", action="store_true",
                   help="skip signed cert ZIP emit")
    p.add_argument("--no-bundle", action="store_true",
                   help="skip operator-package.zip bundling")
    p.add_argument("--game-id", default=None,
                   help="override IR meta.game_id")
    p.add_argument("--swid", default=None, help="override IR meta.swid")
    p.add_argument("--vendor", default=None,
                   help="override IR meta.vendor")
    p.add_argument("--json", action="store_true",
                   help="print full report JSON to stdout in addition "
                        "to writing operator-pilot.json")
    args = p.parse_args(argv)

    cfg = PilotConfig(
        ir_path=args.ir_path,
        out_dir=args.out,
        jurisdictions=args.jurisdiction or [],
        emit_xml=not args.no_xml,
        emit_zip=not args.no_zip,
        bundle_zip=not args.no_bundle,
        game_id=args.game_id,
        swid=args.swid,
        vendor=args.vendor,
        raw_dir=args.raw,
        mc_report_path=args.mc,
    )
    report = run_pilot(cfg)

    # Pretty summary table
    sys.stdout.write(
        f"\n[operator-pilot] {len(report.steps)} steps · "
        f"passed={report.step_counts.get('passed', 0)} "
        f"skipped={report.step_counts.get('skipped', 0)} "
        f"failed={report.step_counts.get('failed', 0)} · "
        f"wall={report.elapsed_total_ms:.1f}ms\n"
    )
    for s in report.steps:
        sys.stdout.write(
            f"  {s.status:8s} {s.name:32s} {s.elapsed_ms:7.1f}ms"
            + (f"  → {s.output}" if s.output else "")
            + (f"  ({s.detail})" if s.detail else "")
            + "\n"
        )
    if report.bundle_path:
        sys.stdout.write(f"\n📦 bundle: {report.bundle_path}\n")

    if args.json:
        sys.stdout.write("\n" + json.dumps(report.to_dict(), indent=2,
                                           sort_keys=True) + "\n")

    # Exit code policy
    load_step = next((s for s in report.steps if s.name == "load_ir"), None)
    if load_step and load_step.status == "failed":
        return 2
    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
