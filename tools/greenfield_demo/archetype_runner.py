"""W5.8 — Greenfield archetype demo runner.

Drives the W5.8 archetype pipeline across all five archetypes and
optionally chains the W5.7 lines demo as the first archetype:

  1. lines        (W5.7 wolf_eruption_mythic.gdd via tools.greenfield_demo)
  2. ways (243)   (tools/greenfield_demo/tiger_243ways.gdd)
  3. megaways     (tools/greenfield_demo/storm_megaways.gdd)
  4. hold_and_win (tools/greenfield_demo/golden_holdwin.gdd)
  5. cascade      (tools/greenfield_demo/orchard_cascade.gdd)

Emits a per-archetype report tuple (acceptance JSON + cert ZIP) into
`reports/greenfield-demo/` and a roll-up `archetype_summary.json` that
records the verdict for each archetype.

CLI usage:

    python3 -m tools.greenfield_demo.archetype_runner
    python3 -m tools.greenfield_demo.archetype_runner --spins 100000
    python3 -m tools.greenfield_demo.archetype_runner --include-lines

Exit codes:
    0 — all archetypes report PASS
    1 — any archetype FAILs or any pipeline raises
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .archetype_pipeline import (
    DEFAULT_OUT_DIR,
    DEMO_SPINS,
    ENGINE_BIN,
    run_pipeline,
)
from .pipeline import run_pipeline as run_w57_lines_pipeline


REPO = Path(__file__).resolve().parents[2]
DEFAULT_GDD_DIR = Path(__file__).resolve().parent

ARCHETYPE_GDDS = [
    ("ways",         "tiger_243ways.gdd"),
    ("megaways",     "storm_megaways.gdd"),
    ("hold_and_win", "golden_holdwin.gdd"),
    ("cascade",      "orchard_cascade.gdd"),
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m tools.greenfield_demo.archetype_runner",
        description="W5.8 — run greenfield archetype pipeline across all "
                    "five archetypes (lines + ways + megaways + H&W + cascade).",
    )
    parser.add_argument(
        "--out-dir", default=str(DEFAULT_OUT_DIR),
        help=f"output directory (default: {DEFAULT_OUT_DIR})",
    )
    parser.add_argument(
        "--spins", type=int, default=DEMO_SPINS,
        help=f"MC spin budget per archetype (default: {DEMO_SPINS})",
    )
    parser.add_argument(
        "--include-lines", action="store_true",
        help="Also re-run the W5.7 lines demo as the first archetype "
             "(skip by default since W5.7 already shipped a cert bundle).",
    )
    parser.add_argument(
        "--engine-bin", default=str(ENGINE_BIN),
        help=f"slot-sim release binary (default: {ENGINE_BIN})",
    )
    args = parser.parse_args(argv)

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    engine_bin = Path(args.engine_bin)

    summary: dict[str, dict] = {}
    any_fail = False

    # Optionally run the W5.7 lines demo as archetype #1.
    if args.include_lines:
        print("▶ Archetype 1/5: lines (W5.7 wolf_eruption_mythic)",
              file=sys.stderr)
        try:
            art = run_w57_lines_pipeline(
                DEFAULT_GDD_DIR / "wolf_eruption_mythic.gdd",
                out_dir=out_dir,
                spins=args.spins,
                engine_bin=engine_bin,
            )
            summary["lines"] = {
                "archetype": "lines",
                "swid": "200-9999-001",
                "verdict": art.acceptance["verdict"],
                "mc_rtp": art.mc_verdict["mc_rtp"],
                "mc_hit_freq": art.mc_verdict["mc_hit_freq"],
                "target_rtp": art.mc_verdict["target_rtp"],
                "target_hit_freq": art.mc_verdict["target_hit_freq"],
                "delta_rtp": art.mc_verdict["delta_rtp"],
                "delta_hit_freq": art.mc_verdict["delta_hit_freq"],
                "cert_zip": art.cert_zip_path.name,
                "gates": art.acceptance["gates"],
            }
            if not art.acceptance["passed"]:
                any_fail = True
        except Exception as exc:  # noqa: BLE001
            print(f"× lines archetype FAILED: {exc}", file=sys.stderr)
            summary["lines"] = {"verdict": "ERROR", "error": str(exc)}
            any_fail = True

    # Run the 4 W5.8 archetypes.
    for idx, (arch, gdd_name) in enumerate(ARCHETYPE_GDDS, start=2):
        print(f"▶ Archetype {idx}/5: {arch}  ({gdd_name})", file=sys.stderr)
        gdd_path = DEFAULT_GDD_DIR / gdd_name
        try:
            art = run_pipeline(
                gdd_path,
                out_dir=out_dir,
                spins=args.spins,
                engine_bin=engine_bin,
            )
            summary[arch] = {
                "archetype": arch,
                "swid": art.swid,
                "verdict": art.acceptance["verdict"],
                "mc_rtp": art.mc_verdict["mc_rtp"],
                "mc_hit_freq": art.mc_verdict["mc_hit_freq"],
                "target_rtp": art.mc_verdict["target_rtp"],
                "target_hit_freq": art.mc_verdict["target_hit_freq"],
                "delta_rtp": art.mc_verdict["delta_rtp"],
                "delta_hit_freq": art.mc_verdict["delta_hit_freq"],
                "smt_delta_rtp": art.smt_synth["delta_rtp"],
                "cert_zip": art.cert_zip_path.name,
                "gates": art.acceptance["gates"],
            }
            if not art.acceptance["passed"]:
                any_fail = True
        except Exception as exc:  # noqa: BLE001
            print(f"× {arch} archetype FAILED: {exc}", file=sys.stderr)
            summary[arch] = {"verdict": "ERROR", "error": str(exc)}
            any_fail = True

    overall = {
        "schema": "greenfield-archetype-summary/v1",
        "n_archetypes": len(summary),
        "n_pass": sum(1 for s in summary.values() if s.get("verdict") == "PASS"),
        "n_fail": sum(1 for s in summary.values() if s.get("verdict") != "PASS"),
        "all_pass": not any_fail,
        "archetypes": summary,
    }
    summary_path = out_dir / "archetype_summary.json"
    summary_path.write_text(json.dumps(overall, indent=2, sort_keys=True))
    print("", file=sys.stderr)
    print("══════════ W5.8 Greenfield Archetype Catalog ══════════",
          file=sys.stderr)
    for arch, s in summary.items():
        print(f"  {arch:14s} verdict={s.get('verdict', '?')}  "
              f"mc_rtp={s.get('mc_rtp', 0):.4f}  "
              f"delta_rtp={s.get('delta_rtp', 0):+.4f}",
              file=sys.stderr)
    print(f"  → summary: {summary_path}", file=sys.stderr)
    print(f"  OVERALL: {'PASS' if overall['all_pass'] else 'FAIL'}",
          file=sys.stderr)

    return 0 if overall["all_pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
