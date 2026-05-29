"""W5.7 — Greenfield game pipeline demo.

Drives the existing Math DSL → Z3 multi-objective SMT synthesizer →
slot-sim universal IR → engine MC → signed cert bundle on a brand-new
synthetic game spec that has NO PAR sheet attached.

The package reuses (does NOT re-roll) every upstream module:

  • DSL parser           : tools.math_dsl.spec
  • DSL → ts-IR compiler : tools.math_dsl.compile
  • SMT weight synth     : tools.smt.weight_synthesizer.synth_multi_objective
  • Engine MC binary     : engine/slot-sim/target/release/slot-sim
  • Cert bundle packager : tools.cert_bundle_swid.{manifest,sign,zip_bundle}

The only NEW code is:

  • `pipeline.py`  — orchestrates the six pipeline stages + emits artefacts.
  • `ts_to_universal.py` — converts the math_dsl ts-shape IR (where the
    SMT solver lives) into the slot-sim universal shape (where the engine
    lives). Both shapes carry the same math; only field layout differs.
  • `__main__.py`  — `python3 -m tools.greenfield_demo <gdd.yaml>`.
  • `wolf_eruption_mythic.gdd` — the synthetic GDD itself.

Demo SWID is `200-9999-001` (deliberately distinct from any real vendor
SWID range — the 9999 family is reserved for synthetic / demo games).
"""

from .pipeline import (
    GreenfieldArtefacts,
    SWID,
    run_pipeline,
)

__all__ = [
    "GreenfieldArtefacts",
    "SWID",
    "run_pipeline",
]
