"""PHASE 20 — Adversarial Math Fuzzer kernel.

Each attack recipe is a deterministic IR mutator that produces an IR
designed to break a downstream solver. The harness runs every recipe,
collects what the solver/estimator returns, and reports failures
(crashes, NaN, RTP > 1) as actionable engineer bugs.
"""

from __future__ import annotations

import copy
import math
import random
from dataclasses import dataclass, asdict, field
from typing import Any, Callable, Optional


# ─── Recipe registry ───────────────────────────────────────────────────────


@dataclass
class AttackRecipe:
    name: str
    description: str
    mutator: Callable[[dict, random.Random], dict]


_RECIPES: dict[str, AttackRecipe] = {}


def _register(recipe: AttackRecipe) -> None:
    _RECIPES[recipe.name] = recipe


def _baseline_ir() -> dict[str, Any]:
    return {
        "meta": {"name": "AdvFuzz", "target_rtp": 0.95},
        "topology": {"reels": 5, "rows": 3, "paylines": 1},
        "paytable": [
            {"combo": ["A"] * 5, "pays": 10.0},
            {"combo": ["B"] * 5, "pays": 50.0},
        ],
        "reels": {
            "base": [
                {"set": 1, "reels": [
                    [{"symbol": "A", "weight": 4}, {"symbol": "B", "weight": 6}]
                    for _ in range(5)
                ]}
            ],
        },
    }


# ─── Attack recipes ────────────────────────────────────────────────────────


def _r_nan_pay(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    if ir.get("paytable"):
        ir["paytable"][0]["pays"] = float("nan")
    return ir


def _r_inf_pay(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    if ir.get("paytable"):
        ir["paytable"][0]["pays"] = float("inf")
    return ir


def _r_zero_weight_reel(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    base = ir["reels"]["base"][0]["reels"]
    for cell in base[0]:
        cell["weight"] = 0
    return ir


def _r_rtp_overflow(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    # Single symbol everywhere with massive pay → RTP > 1
    for reel in ir["reels"]["base"][0]["reels"]:
        for c in reel:
            c["weight"] = 1 if c["symbol"] == "A" else 0
    ir["paytable"] = [{"combo": ["A"] * 5, "pays": 100_000.0}]
    return ir


def _r_negative_pay(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    if ir.get("paytable"):
        ir["paytable"][0]["pays"] = -100.0
    return ir


def _r_combo_shape_mismatch(ir: dict, rng: random.Random) -> dict:
    """Combo length ≠ reel count."""
    ir = copy.deepcopy(ir)
    ir["paytable"].append({"combo": ["A"], "pays": 10.0})        # too short
    ir["paytable"].append({"combo": ["A"] * 10, "pays": 10.0})   # too long
    return ir


def _r_empty_paytable(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    ir["paytable"] = []
    return ir


def _r_empty_reels(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    ir["reels"] = {"base": []}
    return ir


def _r_unknown_symbol_in_paytable(ir: dict, rng: random.Random) -> dict:
    """Paytable references a symbol that doesn't exist on the reels."""
    ir = copy.deepcopy(ir)
    ir["paytable"].append({"combo": ["Z"] * 5, "pays": 999.0})
    return ir


def _r_extreme_topology(ir: dict, rng: random.Random) -> dict:
    """Topology says 5 reels but actual reels block has 3."""
    ir = copy.deepcopy(ir)
    ir["topology"]["reels"] = 100
    ir["topology"]["rows"] = 100
    return ir


def _r_random_perturbation(ir: dict, rng: random.Random) -> dict:
    ir = copy.deepcopy(ir)
    # Mix of safe-but-edgy perturbations
    if rng.random() < 0.5:
        for c in ir["reels"]["base"][0]["reels"][rng.randrange(5)]:
            c["weight"] = rng.randrange(1, 1_000_000)
    if rng.random() < 0.5 and ir["paytable"]:
        ir["paytable"][0]["pays"] *= rng.choice([0.0001, 10_000.0])
    return ir


# Register all recipes
for fn, name, desc in [
    (_r_nan_pay,                    "nan_pay",                "Paytable entry pay = NaN"),
    (_r_inf_pay,                    "inf_pay",                "Paytable entry pay = +inf"),
    (_r_zero_weight_reel,           "zero_weight_reel",       "Reel 0 has all-zero weights"),
    (_r_rtp_overflow,               "rtp_overflow",           "Single combo dominates → RTP ≫ 1"),
    (_r_negative_pay,               "negative_pay",           "Paytable entry pay < 0"),
    (_r_combo_shape_mismatch,       "combo_shape_mismatch",   "Combo length ≠ reel count"),
    (_r_empty_paytable,             "empty_paytable",         "Paytable is empty list"),
    (_r_empty_reels,                "empty_reels",            "Reels.base is empty list"),
    (_r_unknown_symbol_in_paytable, "unknown_symbol",         "Paytable references symbol not on reels"),
    (_r_extreme_topology,           "extreme_topology",       "Topology dimensions wildly inflated"),
    (_r_random_perturbation,        "random_perturbation",    "Mix of edgy random perturbations"),
]:
    _register(AttackRecipe(name=name, description=desc, mutator=fn))


# ─── Public API ────────────────────────────────────────────────────────────


def list_attack_recipes() -> list[str]:
    return sorted(_RECIPES.keys())


def get_recipe(name: str) -> AttackRecipe:
    if name not in _RECIPES:
        raise KeyError(f"unknown recipe: {name!r}")
    return _RECIPES[name]


def generate_adversarial_ir(recipe: str, seed: int = 0xa11_fa11) -> dict[str, Any]:
    """Generate a single adversarial IR per a named recipe."""
    rng = random.Random(seed)
    base = _baseline_ir()
    return get_recipe(recipe).mutator(base, rng)


# ─── Sweep harness ─────────────────────────────────────────────────────────


@dataclass
class AttackOutcome:
    recipe: str
    seed: int
    estimator_value: Optional[float]    # rtp estimate or None on crash
    estimator_finite: bool
    estimator_in_unit_band: bool        # 0 ≤ rtp ≤ 1.05 (small wiggle)
    error: Optional[str] = None


@dataclass
class AttackReport:
    schema_version: str = "urn:slotmath:adv-fuzz:v1"
    iterations: int = 0
    recipes_run: list[str] = field(default_factory=list)
    outcomes: list[AttackOutcome] = field(default_factory=list)
    crashes: int = 0
    non_finite: int = 0
    out_of_band: int = 0


def _bernoulli_estimate(ir: dict[str, Any]) -> Optional[float]:
    """Tiny duplicate of slot_bench's estimator — kept here so the
    fuzzer is independent of any downstream module."""
    paytable = ir.get("paytable") or []
    base = (ir.get("reels") or {}).get("base") or []
    if not isinstance(paytable, list) or not isinstance(base, list) or not base:
        return None
    first = base[0]
    reels = first.get("reels") if isinstance(first, dict) else None
    if not isinstance(reels, list) or not reels:
        return None
    reel_totals: list[dict[str, float]] = []
    for reel in reels:
        if not isinstance(reel, list):
            return None
        freq: dict[str, float] = {}
        total = 0.0
        for cell in reel:
            sym = str(cell.get("symbol", "")) if isinstance(cell, dict) else str(cell)
            w = float(cell.get("weight", 1)) if isinstance(cell, dict) else 1.0
            freq[sym] = freq.get(sym, 0.0) + w
            total += w
        reel_totals.append({k: v / total for k, v in freq.items()} if total else {})
    rtp = 0.0
    for e in paytable:
        if not isinstance(e, dict):
            continue
        combo = e.get("combo")
        pay = e.get("pays")
        if not isinstance(combo, list) or not isinstance(pay, (int, float)):
            continue
        p = 1.0
        for i, sym in enumerate(combo):
            if i >= len(reel_totals):
                p = 0.0
                break
            if sym in ("--", "*", "", None):
                continue
            p *= reel_totals[i].get(str(sym), 0.0)
        rtp += p * float(pay)
    return rtp


def run_adversarial_sweep(
    *,
    recipes: Optional[list[str]] = None,
    iterations: int = 1,
    base_seed: int = 0xb11_ba11,
) -> AttackReport:
    """Run one or more adversarial recipes; collect outcomes.

    For each (recipe × iteration) pair:
      - generate IR
      - run Bernoulli estimator (graceful on crash → error="...")
      - classify finite + in-band

    Returns AttackReport summarising counts + per-outcome detail.
    """
    if iterations < 1:
        raise ValueError("iterations must be ≥ 1")
    if recipes is None:
        recipes = list_attack_recipes()
    unknown = [r for r in recipes if r not in _RECIPES]
    if unknown:
        raise ValueError(f"unknown recipes: {unknown}")

    report = AttackReport(iterations=iterations, recipes_run=list(recipes))
    for r_name in recipes:
        for i in range(iterations):
            seed = base_seed + i
            try:
                ir = generate_adversarial_ir(r_name, seed=seed)
            except Exception as exc:  # noqa: BLE001
                outcome = AttackOutcome(
                    recipe=r_name, seed=seed, estimator_value=None,
                    estimator_finite=False, estimator_in_unit_band=False,
                    error=f"gen_failed: {exc}",
                )
                report.outcomes.append(outcome)
                report.crashes += 1
                continue
            try:
                est = _bernoulli_estimate(ir)
            except Exception as exc:  # noqa: BLE001
                report.outcomes.append(AttackOutcome(
                    recipe=r_name, seed=seed, estimator_value=None,
                    estimator_finite=False, estimator_in_unit_band=False,
                    error=f"estimator_crash: {exc}",
                ))
                report.crashes += 1
                continue
            finite = est is not None and math.isfinite(est)
            in_band = finite and 0.0 <= float(est) <= 1.05
            if not finite:
                report.non_finite += 1
            elif not in_band:
                report.out_of_band += 1
            report.outcomes.append(AttackOutcome(
                recipe=r_name, seed=seed, estimator_value=est,
                estimator_finite=finite, estimator_in_unit_band=in_band,
            ))
    return report


def attack_report_to_dict(report: AttackReport) -> dict[str, Any]:
    return asdict(report)
