"""PHASE 18 — Multi-Engine Cross-Validation Harness.

Industry-first regression gate: feed identical IR through N independent
engine implementations + compare measured RTP / hit-frequency / win-
frequency. When two engines disagree beyond `tolerance`, surface the
delta + bisect candidate features.

Engine implementations covered:
  - **python_synthetic**: tools.rgs_live.engine (Mulberry32, middle payline)
  - **python_bernoulli**: tools.drift_sentinel-style closed-form estimate
  - **rust_slot_sim**: subprocess `cargo run --release -p slot-sim`
    (auto-skipped when binary not present; used as ground truth when on)
  - **ts_engine**: opciono per `tsx`/`node` availability (post-MVP)

Public API:

    from tools.cross_validate import (
        ValidationResult,
        EngineResult,
        run_cross_validate,
        list_available_engines,
    )

    result = run_cross_validate(
        ir_path="games/foo/ir.json",
        engines=("python_synthetic", "python_bernoulli"),
        spins=10_000,
        tolerance=0.01,
    )
    for engine_name, m in result.per_engine.items():
        print(engine_name, m.rtp, m.hit_freq)

CLI:
    python -m tools.cross_validate --ir IR.json --spins 10000 --out report.json
"""

from __future__ import annotations

from tools.cross_validate.harness import (
    ValidationResult,
    EngineResult,
    run_cross_validate,
    list_available_engines,
)

__all__ = [
    "ValidationResult",
    "EngineResult",
    "run_cross_validate",
    "list_available_engines",
]
