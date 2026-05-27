"""`slot-mega-pipeline` CLI — end-to-end orchestrator across 13 stages."""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from pathlib import Path

from tools.mega_pipeline import run_mega_pipeline


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="slot-mega-pipeline",
        description="CONSOLIDATION PASS — 13-stage E2E pipeline.",
    )
    parser.add_argument("prompt",
                         help="Natural-language game spec.")
    parser.add_argument("--out", required=True,
                         help="Output directory.")
    parser.add_argument("--swid", default="001",
                         help="SWID for cert manifest.")
    parser.add_argument("--target-rtp", type=float, default=None,
                         help="Override target RTP from prompt.")
    parser.add_argument("--json", action="store_true",
                         help="Print full manifest JSON to stdout.")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    out_dir = Path(args.out)
    report = run_mega_pipeline(
        prompt=args.prompt,
        out_dir=out_dir,
        swid=args.swid,
        target_rtp_override=args.target_rtp,
        quiet=args.quiet,
    )

    if args.json:
        print(json.dumps(asdict(report), indent=2))
    elif not args.quiet:
        print(f"[mega-pipeline] {report.passed_stages} passed, "
              f"{report.failed_stages} failed in {report.total_elapsed_ms:.1f} ms")
        print(f"  out:        {report.out_dir}")
        print(f"  artefacts:  {len(report.artefact_sha256)} files")
        for s in report.stages:
            mark = "✅" if s.ok else "❌"
            line = f"  {mark} {s.stage} ({s.elapsed_ms:.1f} ms)"
            if not s.ok:
                line += f" — {s.error}"
            print(line)

    return 0 if report.failed_stages == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
