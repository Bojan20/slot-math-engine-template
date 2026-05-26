"""CLI entry for slot-backtest-runner."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

from tools.backtest_runner.runner import JurisdictionSnapshot, backtest


def _load_snapshots(p: Path) -> list[JurisdictionSnapshot]:
    raw = json.loads(p.read_text())
    if not isinstance(raw, list):
        raise ValueError("snapshots file must be a JSON array")
    snaps: list[JurisdictionSnapshot] = []
    for entry in raw:
        snaps.append(JurisdictionSnapshot(
            snapshot_date=str(entry.get("snapshot_date", "?")),
            jurisdiction=str(entry.get("jurisdiction", "?")),
            rules=entry.get("rules") or {},
        ))
    return snaps


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-backtest-runner",
        description=(
            "Replay an IR against historical jurisdiction rule snapshots."
        ),
    )
    p.add_argument("--ir", type=Path, required=True)
    p.add_argument("--snapshots", type=Path, required=True)
    p.add_argument("--json", type=Path, default=None)
    p.add_argument("--quiet", action="store_true")
    args = p.parse_args(argv)

    try:
        ir = json.loads(args.ir.read_text())
        snaps = _load_snapshots(args.snapshots)
    except Exception as e:  # noqa: BLE001
        sys.stderr.write(f"failed to load inputs: {e}\n")
        return 2

    report = backtest(ir, snaps)

    if args.json:
        args.json.parent.mkdir(parents=True, exist_ok=True)
        args.json.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))

    if not args.quiet:
        verdict = "✅ PASS" if report.passed else "🔴 FAIL"
        sys.stdout.write(
            f"\n[backtest] {verdict}  game={report.game_id}  "
            f"snapshots={len(report.entries)}  failed={report.n_failed}\n"
        )
        for e in report.entries:
            tag = "✅" if e.passed else "🔴"
            sys.stdout.write(
                f"  {tag} {e.snapshot_date:12s} {e.jurisdiction:8s}  "
                f"{'OK' if e.passed else '; '.join(e.issues)}\n"
            )

    return 0 if report.passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
