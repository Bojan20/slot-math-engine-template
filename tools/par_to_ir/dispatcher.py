"""SLOT-MATH Faza 2.4 — W244 kernel dispatcher.

Maps IR feature kinds → W244 kernel composition (which kernels evaluate
this game). Output appended to IR as `kernel_composition` for downstream
MC orchestrator + auditor.

W244 kernel catalog (22 portable kernels Python + Rust + wasm):
    wheel, pay_anywhere, both_ways, asymmetric_paytable,
    expanding_symbol, persistent_multiplier, buy_feature, charge_meter,
    money_collect, must_hit_by, pick_chain,
    state_machine, sticky_wilds, stacked_wilds,
    cascade, cluster_pays, ways_evaluator,
    hold_and_win (composed = money_collect + must_hit_by),
    crash_kernel, showcase_game,
    inverse_solver, multi_dim_inverse_solver
"""
from __future__ import annotations

from typing import Any


# Mapping: IR feature.kind → list of kernel_id strings (executed in order)
FEATURE_KIND_TO_KERNELS: dict[str, list[str]] = {
    "free_spins": ["expanding_symbol"],
    "hold_and_win": ["hold_and_win"],  # composed kernel
    "cascade": ["cascade"],
    "respin": ["state_machine"],
    "pick": ["pick_chain"],
    "wheel": ["wheel"],
    "buy_feature": ["buy_feature"],
    "ante_bet": ["buy_feature"],  # same math model, different params
    "gamble": ["state_machine"],
    "mystery_symbol": ["state_machine"],
    "symbol_upgrade": ["state_machine"],
    "linear_progressive": ["must_hit_by"],
}


# Mapping: IR evaluation.kind → list of base-evaluator kernel(s)
EVALUATION_KIND_TO_KERNELS: dict[str, list[str]] = {
    "lines": ["asymmetric_paytable"],  # generic line eval
    "ways": ["ways_evaluator"],
    "cluster": ["cluster_pays"],
    "cluster_pays": ["cluster_pays"],  # alias — many GDDs use the full name
    "pay_anywhere": ["pay_anywhere"],
    "pattern": ["asymmetric_paytable"],
    "crash": ["crash_kernel"],  # Stake Crash / Aviator / Bustabit pattern
}


# Mapping: IR symbol.kind → optional kernel hook
SYMBOL_KIND_TO_KERNELS: dict[str, list[str]] = {
    "sticky": ["sticky_wilds"],
    "expanding": ["expanding_symbol"],
    "transform": ["state_machine"],
    "mystery": ["state_machine"],
    "chain_wild": ["stacked_wilds"],
}


# Mapping: IR feature.modifiers → additional kernel hook
MODIFIER_TO_KERNELS: dict[str, list[str]] = {
    "sticky_wilds": ["sticky_wilds"],
    "expanding_wilds": ["expanding_symbol"],
    "multiplier_ladder": ["persistent_multiplier"],
    "mystery_symbol": ["state_machine"],
}


def dispatch_kernels(ir: dict[str, Any]) -> list[dict[str, Any]]:
    """Return ordered list of kernel composition entries for this IR.

    Each entry: {"feature_kind": str, "kernel_id": str, "kernel_version": str}
    """
    composition: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    # Base evaluator from `evaluation.kind`
    eval_kind = ir.get("evaluation", {}).get("kind")
    if eval_kind and eval_kind in EVALUATION_KIND_TO_KERNELS:
        for kid in EVALUATION_KIND_TO_KERNELS[eval_kind]:
            key = (f"evaluation.{eval_kind}", kid)
            if key not in seen:
                composition.append({
                    "feature_kind": f"evaluation.{eval_kind}",
                    "kernel_id": kid,
                    "kernel_version": "w244",
                })
                seen.add(key)

    # Symbol behaviors
    for sym in ir.get("symbols", []):
        sk = sym.get("kind")
        if sk in SYMBOL_KIND_TO_KERNELS:
            for kid in SYMBOL_KIND_TO_KERNELS[sk]:
                key = (f"symbol.{sk}", kid)
                if key not in seen:
                    composition.append({
                        "feature_kind": f"symbol.{sk}",
                        "kernel_id": kid,
                        "kernel_version": "w244",
                    })
                    seen.add(key)

    # Features (canonical mapping)
    for feat in ir.get("features", []):
        fk = feat.get("kind")
        if fk in FEATURE_KIND_TO_KERNELS:
            for kid in FEATURE_KIND_TO_KERNELS[fk]:
                key = (f"feature.{fk}", kid)
                if key not in seen:
                    composition.append({
                        "feature_kind": f"feature.{fk}",
                        "kernel_id": kid,
                        "kernel_version": "w244",
                    })
                    seen.add(key)

        # Modifier hooks
        for mod in feat.get("modifiers", []) or []:
            if mod in MODIFIER_TO_KERNELS:
                for kid in MODIFIER_TO_KERNELS[mod]:
                    key = (f"modifier.{mod}", kid)
                    if key not in seen:
                        composition.append({
                            "feature_kind": f"modifier.{mod}",
                            "kernel_id": kid,
                            "kernel_version": "w244",
                        })
                        seen.add(key)

    return composition


def attach_kernel_composition(ir: dict[str, Any]) -> dict[str, Any]:
    """In-place: add kernel_composition list to IR."""
    ir["kernel_composition"] = dispatch_kernels(ir)
    return ir
