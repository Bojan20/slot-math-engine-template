"""SLOT-MATH W244 Composer — execute dispatched kernels and sum RTP contributions.

The W244 dispatcher (`tools/par_to_ir/dispatcher.py`) decides WHICH
kernels evaluate a given IR. This module CALLS those kernels with
IR-derived params and aggregates their per-base-spin RTP contributions
into a single composite RTP estimate — the first real math evaluator
in slot-math.

Architecture:

    IR → dispatcher (kernel_ids list)
       → params_builder (per-kernel param dataclass)
       → kernel_rtp_fn (closed-form RTP contribution)
       → composer (sum + compare vs PAR target)
       → CompositionResult (delta vs target, per-kernel breakdown)

This complements the synthetic mc_convergence.rs hot-path:
  - mc_convergence  → Monte-Carlo plumbing proof, fast, synthetic worker
  - composer        → Closed-form W244 evaluator, slow, real math

For the v1.0 product the composer is **scoped to closed-form RTP**
contribution per registered kernel; per-spin MC simulation is the
NEXT layer (W244 kernel DAG runtime).
"""
from __future__ import annotations

import importlib
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

# Make `slot_math_kernels` importable even when the package isn't
# pip-installed (PEP-668 prevents implicit installs on system Python).
_REPO = Path(__file__).resolve().parents[2]
_KERNELS_SRC = _REPO / "packages" / "slot-math-kernels" / "src"
if _KERNELS_SRC.is_dir() and str(_KERNELS_SRC) not in sys.path:
    sys.path.insert(0, str(_KERNELS_SRC))

from tools.par_to_ir.dispatcher import dispatch_kernels  # noqa: E402


# Map kernel_id → (module_name, params_class, rtp_fn_name)
# NB: slot-math-kernels is a sibling package under packages/; install
# `pip install -e packages/slot-math-kernels` for module resolution.
KERNEL_REGISTRY: dict[str, dict[str, str]] = {
    "expanding_symbol": {
        "module": "slot_math_kernels.expanding_symbol",
        "params": "ExpandingSymbolParams",
        "rtp_fn": "expanding_symbol_rtp",
    },
    "hold_and_win": {
        "module": "slot_math_kernels.hold_and_win",
        "params": "HoldAndWinParams",
        "rtp_fn": "hold_and_win_rtp",
    },
    "asymmetric_paytable": {
        "module": "slot_math_kernels.asymmetric_paytable",
        "params": "AsymmetricPaytableParams",
        "rtp_fn": "asymmetric_paytable_rtp",
    },
    "cascade": {
        "module": "slot_math_kernels.cascade",
        "params": "CascadeParams",
        "rtp_fn": "cascade_rtp",
    },
    "ways_evaluator": {
        "module": "slot_math_kernels.ways_evaluator",
        "params": "WaysEvaluatorParams",
        "rtp_fn": "ways_evaluator_rtp",
    },
    "cluster_pays": {
        "module": "slot_math_kernels.cluster_pays",
        "params": "ClusterPaysParams",
        "rtp_fn": "cluster_pays_rtp",
    },
    "wheel": {
        "module": "slot_math_kernels.wheel",
        "params": "WheelParams",
        "rtp_fn": "wheel_rtp",
    },
    "buy_feature": {
        "module": "slot_math_kernels.buy_feature",
        "params": "BuyFeatureParams",
        "rtp_fn": "buy_feature_rtp",
    },
    "must_hit_by": {
        "module": "slot_math_kernels.must_hit_by",
        "params": "MustHitByParams",
        "rtp_fn": "must_hit_by_rtp",
    },
    "charge_meter": {
        "module": "slot_math_kernels.charge_meter",
        "params": "ChargeMeterParams",
        "rtp_fn": "charge_meter_rtp",
    },
    "money_collect": {
        "module": "slot_math_kernels.money_collect",
        "params": "MoneyCollectParams",
        "rtp_fn": "money_collect_rtp_contribution",
    },
    "crash_kernel": {
        "module": "slot_math_kernels.crash_kernel",
        "params": "CrashParams",
        # crash_kernel.rtp returns float, not dict — composer wraps below.
        "rtp_fn": "rtp",
    },
}


@dataclass
class KernelExecution:
    """Result of one kernel firing for one IR composition entry."""
    kernel_id: str
    feature_kind: str
    rtp_contribution: float
    breakdown: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


@dataclass
class CompositionResult:
    """End-to-end composition output: per-kernel + total + vs-PAR delta."""
    game_id: str
    target_rtp: float | None
    composed_rtp: float
    delta_vs_target_bps: float | None
    per_kernel: list[KernelExecution]
    unsupported_kernels: list[str]
    overall_pass: bool
    tolerance_bps: float

    def summary(self) -> str:
        lines = [
            f"# W244 Composition — {self.game_id}",
            f"Target RTP:   {self.target_rtp:.4%}" if self.target_rtp else "Target RTP:   (none)",
            f"Composed RTP: {self.composed_rtp:.4%}",
        ]
        if self.delta_vs_target_bps is not None:
            lines.append(f"Δ vs target:  {self.delta_vs_target_bps:+.2f} bps "
                         f"(tolerance ±{self.tolerance_bps:.0f} bps) "
                         f"{'✅ PASS' if self.overall_pass else '🔴 FAIL'}")
        lines.append("")
        lines.append("Per-kernel:")
        for k in self.per_kernel:
            tag = "✅" if k.error is None else "🔴"
            lines.append(f"  {tag} {k.kernel_id:24} ({k.feature_kind:30})  "
                         f"RTP={k.rtp_contribution:.4%}")
            if k.error:
                lines.append(f"     ERROR: {k.error}")
        if self.unsupported_kernels:
            lines.append("")
            lines.append(f"⚠️  Unsupported in registry: {', '.join(self.unsupported_kernels)}")
        return "\n".join(lines)


def _load_kernel(kernel_id: str) -> tuple[type, Callable] | None:
    """Resolve (ParamsClass, rtp_fn) for a kernel_id, or None if not registered."""
    entry = KERNEL_REGISTRY.get(kernel_id)
    if entry is None:
        return None
    try:
        mod = importlib.import_module(entry["module"])
        params_cls = getattr(mod, entry["params"])
        rtp_fn = getattr(mod, entry["rtp_fn"])
        return params_cls, rtp_fn
    except (ImportError, AttributeError) as e:
        raise RuntimeError(
            f"Failed to load kernel {kernel_id}: {e}. "
            f"Did you `pip install -e packages/slot-math-kernels`?"
        ) from e


def compose(
    ir: dict[str, Any],
    par: dict[str, Any] | None = None,
    params_builder: Callable[[str, dict[str, Any], dict[str, Any] | None], Any] | None = None,
    tolerance_bps: float = 5.0,
) -> CompositionResult:
    """Execute all dispatched kernels for an IR and aggregate RTP.

    Args:
        ir: Game IR dict.
        par: Optional canonical PAR with `.rtp.rtp_total` for delta comparison.
        params_builder: Callable `(kernel_id, ir, par) -> params_instance`.
            If omitted, only kernels with a trivial all-defaults constructor
            are supported (rare — most need game-specific params).
        tolerance_bps: PASS/FAIL threshold for `|delta| ≤ tolerance_bps`.

    Returns:
        CompositionResult with per-kernel + composite + delta-vs-target.
    """
    target_rtp = par.get("rtp", {}).get("rtp_total") if par else None
    game_id = ir.get("meta", {}).get("id", "unknown")

    composition = dispatch_kernels(ir)

    per_kernel: list[KernelExecution] = []
    unsupported: list[str] = []
    total_rtp = 0.0

    for entry in composition:
        kid = entry["kernel_id"]
        fkind = entry["feature_kind"]

        loaded = _load_kernel(kid)
        if loaded is None:
            unsupported.append(kid)
            per_kernel.append(KernelExecution(
                kernel_id=kid, feature_kind=fkind,
                rtp_contribution=0.0,
                error=f"kernel {kid} not in composer registry",
            ))
            continue

        params_cls, rtp_fn = loaded

        if params_builder is None:
            per_kernel.append(KernelExecution(
                kernel_id=kid, feature_kind=fkind,
                rtp_contribution=0.0,
                error="no params_builder provided — closed-form needs IR-specific params",
            ))
            continue

        try:
            params = params_builder(kid, ir, par)
            if params is None:
                per_kernel.append(KernelExecution(
                    kernel_id=kid, feature_kind=fkind,
                    rtp_contribution=0.0,
                    error="params_builder returned None (kernel not configurable from this IR)",
                ))
                continue
            result = rtp_fn(params)
            # Some kernels (crash_kernel.rtp) return float directly; wrap.
            if isinstance(result, (int, float)):
                result = {"rtp_contribution": float(result)}
            rtp_contrib = float(result.get("rtp_contribution", 0.0))
            total_rtp += rtp_contrib
            per_kernel.append(KernelExecution(
                kernel_id=kid, feature_kind=fkind,
                rtp_contribution=rtp_contrib,
                breakdown=result,
            ))
        except Exception as e:
            per_kernel.append(KernelExecution(
                kernel_id=kid, feature_kind=fkind,
                rtp_contribution=0.0,
                error=f"{type(e).__name__}: {e}",
            ))

    delta_bps = None
    overall_pass = True
    if target_rtp is not None:
        delta_bps = (total_rtp - target_rtp) * 10000.0
        overall_pass = abs(delta_bps) <= tolerance_bps

    return CompositionResult(
        game_id=game_id,
        target_rtp=target_rtp,
        composed_rtp=total_rtp,
        delta_vs_target_bps=delta_bps,
        per_kernel=per_kernel,
        unsupported_kernels=unsupported,
        overall_pass=overall_pass,
        tolerance_bps=tolerance_bps,
    )
