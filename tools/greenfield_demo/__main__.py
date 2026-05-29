"""W5.7 — greenfield_demo CLI entry-point.

Usage
-----

    python3 -m tools.greenfield_demo <gdd_path>
    python3 -m tools.greenfield_demo tools/greenfield_demo/wolf_eruption_mythic.gdd

Exit codes:
    0 — acceptance.json reports `all gates PASS`
    1 — acceptance reports any FAIL, or any pipeline stage raises
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .pipeline import (
    DEFAULT_OUT_DIR,
    DEMO_SEED,
    DEMO_SPINS,
    ENGINE_BIN,
    SWID,
    run_pipeline,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="python3 -m tools.greenfield_demo",
        description="W5.7 — drive Math DSL → SMT → IR → MC → cert bundle "
                    "on a synthetic GDD with no PAR sheet.",
    )
    parser.add_argument(
        "gdd_path",
        nargs="?",
        default=str(
            Path(__file__).parent / "wolf_eruption_mythic.gdd",
        ),
        help="path to GDD YAML file (default: bundled wolf_eruption_mythic.gdd)",
    )
    parser.add_argument(
        "--out-dir", default=str(DEFAULT_OUT_DIR),
        help=f"output directory (default: {DEFAULT_OUT_DIR})",
    )
    parser.add_argument(
        "--spins", type=int, default=DEMO_SPINS,
        help=f"MC spin budget (default: {DEMO_SPINS})",
    )
    parser.add_argument(
        "--seed", type=int, default=DEMO_SEED,
        help=f"MC seed (default: {DEMO_SEED}; derived from SWID {SWID})",
    )
    parser.add_argument(
        "--engine-bin", default=str(ENGINE_BIN),
        help=f"slot-sim release binary (default: {ENGINE_BIN})",
    )
    args = parser.parse_args(argv)

    gdd_path = Path(args.gdd_path)
    if not gdd_path.exists():
        print(f"error: GDD path does not exist: {gdd_path}", file=sys.stderr)
        return 1

    print(f"▶ Running W5.7 greenfield pipeline on {gdd_path}", file=sys.stderr)
    try:
        artefacts = run_pipeline(
            gdd_path,
            out_dir=Path(args.out_dir),
            spins=args.spins,
            seed=args.seed,
            engine_bin=Path(args.engine_bin),
        )
    except Exception as exc:  # noqa: BLE001
        print(f"× pipeline failed: {exc}", file=sys.stderr)
        return 1

    smt = artefacts.smt_synth
    mc = artefacts.mc_verdict
    acc = artefacts.acceptance
    print("", file=sys.stderr)
    print("══════════ W5.7 Greenfield Demo verdict ══════════", file=sys.stderr)
    print(f"  SMT closed-form rtp = {smt['measured_closed_form_rtp']:.6f} "
          f"(target {smt['target_rtp']:.6f}, "
          f"Δ {smt['delta_rtp']:+.6f})", file=sys.stderr)
    print(f"  Engine MC rtp       = {mc['mc_rtp']:.6f} "
          f"(target {mc['target_rtp']:.6f}, "
          f"Δ {mc['delta_rtp']:+.6f})", file=sys.stderr)
    print(f"  Engine MC hit_freq  = {mc['mc_hit_freq']:.6f} "
          f"(target {mc['target_hit_freq']:.6f}, "
          f"Δ {mc['delta_hit_freq']:+.6f})", file=sys.stderr)
    print(f"  Cert bundle         = {artefacts.cert_zip_path.name} "
          f"({artefacts.cert_zip_path.stat().st_size} bytes)", file=sys.stderr)
    for g in acc["gates"]:
        print(f"  gate {g['name']:30s} {g['status']:5s} "
              f"Δ={g['value']:+.6f} tol={g['tolerance']:.6f}",
              file=sys.stderr)
    print(f"  OVERALL acceptance  = {acc['verdict']}", file=sys.stderr)

    return 0 if acc["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
