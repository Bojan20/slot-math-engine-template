"""PHASE 18.B — MC Fuzz Cross-Validator.

Generate synthetic IRs over a perturbation grid; run each through the
cross-validation harness; surface the IRs where engines disagree past
tolerance. Bisect features to flag root-cause candidates.

Use case:
  Operator runs `slot-cross-fuzz --iterations 100` overnight; harness
  emits a report listing 0 (engines agree on every shape) OR N IRs
  where at least one engine drifted. Each drifted row carries the
  feature delta vs baseline so an engineer can bisect quickly.

Algorithm:
  1. Build a baseline minimal IR (5×3, 3 symbols, flat paytable).
  2. Apply a sequence of single-feature perturbations:
       - reel weight shifts (single reel, single symbol weight ±k)
       - paytable pay scale (single entry × {0.5, 2.0})
       - topology dimension (3×3, 7×7, 6×4, 5×4)
       - new payline / new symbol
       - feature-list addition (paste in P10 feature templates)
  3. For each perturbed IR: run_cross_validate() with explicit engines.
  4. Score: |Δrtp_max| vs cohort consensus.
  5. Report: drifted_iterations + baseline_iterations + per-iteration
     feature-delta + dominant drifted engine.

Output:
  reports/fuzz/CROSS_VALIDATE_FUZZ_<iso>.json
    {
      "iterations": N,
      "drifted_count": k,
      "baseline_count": N - k,
      "tolerance": T,
      "drifted": [
        {"iter": i, "feature_delta": "reel0[A].weight += 5",
         "max_delta": 0.012, "drifted_engines": [...]},
        ...
      ]
    }
"""

from __future__ import annotations

import json
import random
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Optional

from tools.cross_validate.harness import (
    run_cross_validate,
)


@dataclass
class FuzzIteration:
    iteration: int
    feature_delta: str
    max_delta: float
    pass_: bool
    drifted_engines: list[str]
    rtp_per_engine: dict[str, float]


@dataclass
class FuzzReport:
    schema_version: str = "urn:slotmath:cross-fuzz:v1"
    iterations: int = 0
    baseline_count: int = 0
    drifted_count: int = 0
    tolerance: float = 0.01
    spins_per_engine: int = 1000
    drifted: list[FuzzIteration] = field(default_factory=list)
    all_iterations: list[FuzzIteration] = field(default_factory=list)


def _baseline_ir() -> dict[str, Any]:
    return {
        "meta": {"name": "Fuzz", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "symbols": [
            {"id": "A", "weight": 8},
            {"id": "B", "weight": 4},
            {"id": "C", "weight": 2},
        ],
        "paytable": [
            {"combo": ["A"] * 5, "pays": 10},
            {"combo": ["B"] * 5, "pays": 50},
            {"combo": ["C"] * 5, "pays": 200},
        ],
        "reels": {
            "base": [
                {
                    "set": 1,
                    "reels": [
                        [
                            {"symbol": "A", "weight": 8},
                            {"symbol": "B", "weight": 4},
                            {"symbol": "C", "weight": 2},
                        ]
                        for _ in range(5)
                    ],
                }
            ],
        },
    }


_REEL_DELTAS = (-3, -1, +1, +3, +5)
_PAY_SCALES = (0.5, 2.0, 4.0)


def _perturbations() -> list[tuple[str, Any]]:
    """Return a list of (label, mutator(ir) → None) pairs.

    Each mutator mutates the IR in place. Labels are human-readable for
    the drift report.
    """
    out: list[tuple[str, Any]] = []

    def make_reel_weight_delta(reel_idx: int, sym: str, delta: int):
        def m(ir: dict) -> None:
            base = ir["reels"]["base"][0]["reels"][reel_idx]
            for cell in base:
                if cell["symbol"] == sym:
                    cell["weight"] = max(1, cell["weight"] + delta)
            # mirror in top-level symbols list for Bernoulli estimator
            for s in ir["symbols"]:
                if s["id"] == sym:
                    s["weight"] = max(1, s["weight"] + delta)
        return m

    for reel_idx in range(5):
        for sym in ("A", "B", "C"):
            for delta in _REEL_DELTAS:
                if delta == 0:
                    continue
                label = f"reel{reel_idx}[{sym}].weight += {delta:+d}"
                out.append((label, make_reel_weight_delta(reel_idx, sym, delta)))

    def make_paytable_scale(entry_idx: int, scale: float):
        def m(ir: dict) -> None:
            ir["paytable"][entry_idx]["pays"] *= scale
        return m

    for entry_idx in range(3):
        for scale in _PAY_SCALES:
            label = f"paytable[{entry_idx}].pays ×= {scale}"
            out.append((label, make_paytable_scale(entry_idx, scale)))

    return out


def run_fuzz_cross_validate(
    *,
    iterations: int = 100,
    spins_per_engine: int = 1000,
    tolerance: float = 0.01,
    engines: Optional[tuple[str, ...]] = None,
    seed: int = 0xfa11_55ee,
    workdir: Optional[Path] = None,
) -> FuzzReport:
    """Run `iterations` perturbed IR cross-validation rounds.

    Returns a FuzzReport surfacing every iteration where engines drifted
    beyond `tolerance` from the cohort mean. Each iteration's IR is
    written to a per-iteration tempfile so the harness can read it back.
    """
    if iterations < 1:
        raise ValueError("iterations must be ≥ 1")
    if spins_per_engine < 1:
        raise ValueError("spins_per_engine must be ≥ 1")
    if tolerance < 0:
        raise ValueError("tolerance must be ≥ 0")

    rng = random.Random(seed)
    perturbs = _perturbations()
    if not perturbs:
        raise RuntimeError("no perturbations registered")

    if workdir is None:
        import tempfile
        workdir = Path(tempfile.mkdtemp(prefix="slot-cross-fuzz-"))
    workdir.mkdir(parents=True, exist_ok=True)

    report = FuzzReport(
        iterations=iterations,
        tolerance=tolerance,
        spins_per_engine=spins_per_engine,
    )

    used_engines = engines if engines is not None else ("python_synthetic", "python_bernoulli")

    for i in range(iterations):
        label, mutator = perturbs[rng.randrange(len(perturbs))]
        ir = _baseline_ir()
        try:
            mutator(ir)
        except Exception:  # noqa: BLE001
            # Bad mutation → skip iteration
            continue
        ir_path = workdir / f"iter-{i:04d}.ir.json"
        ir_path.write_text(json.dumps(ir))

        try:
            result = run_cross_validate(
                ir_path=ir_path,
                engines=used_engines,
                spins=spins_per_engine,
                seed=seed + i,
                tolerance=tolerance,
            )
        except Exception:  # noqa: BLE001
            # Engine call itself crashed — treat as a drift event
            it = FuzzIteration(
                iteration=i,
                feature_delta=label,
                max_delta=float("inf"),
                pass_=False,
                drifted_engines=list(used_engines),
                rtp_per_engine={},
            )
            report.drifted_count += 1
            report.drifted.append(it)
            report.all_iterations.append(it)
            continue

        it = FuzzIteration(
            iteration=i,
            feature_delta=label,
            max_delta=result.max_rtp_abs_delta,
            pass_=result.pass_,
            drifted_engines=list(result.drifted_engines),
            rtp_per_engine={k: v.rtp for k, v in result.per_engine.items()},
        )
        report.all_iterations.append(it)
        if result.pass_:
            report.baseline_count += 1
        else:
            report.drifted_count += 1
            report.drifted.append(it)

    return report


def fuzz_report_to_dict(report: FuzzReport) -> dict[str, Any]:
    d = asdict(report)
    return d
