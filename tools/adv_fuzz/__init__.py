"""PHASE 20 — Adversarial Math Fuzzer.

Generates IRs deliberately crafted to break solvers: NaN/Inf injection,
RTP overflow (Σ pays × prob > 1.0), zero-weight reels, negative pays,
combo-shape mismatches. Runs them through PHASE 18 cross-validator
and reports which adversarial seeds actually trigger drift / errors.

Public API:
  - list_attack_recipes() → list[str]
  - generate_adversarial_ir(recipe, seed) → dict
  - run_adversarial_sweep(recipes=None, iterations=N) → AttackReport
"""

from __future__ import annotations

from tools.adv_fuzz.fuzzer import (
    AttackRecipe,
    AttackReport,
    list_attack_recipes,
    generate_adversarial_ir,
    run_adversarial_sweep,
)

__all__ = [
    "AttackRecipe",
    "AttackReport",
    "list_attack_recipes",
    "generate_adversarial_ir",
    "run_adversarial_sweep",
]
