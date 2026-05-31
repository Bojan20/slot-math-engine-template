"""SLOT-MATH W244 Generic Params Builder.

Game-agnostic IR → kernel params bridge. Replaces wrath_params.py's
hard-coded Wrath logic with a config-driven extractor that works for
any game whose closed-form RTP source follows the slot-math schema.

Expected CF source shape (`closed-form-rtp.json`):

    {
      "total_rtp": 0.96,
      "components": {
        "base_line": 0.28,        # delegated baseline
        "scatter_pay_base": 0.02, # delegated baseline
        "lightning_uplift": 0.07, # delegated baseline (optional)
        "fs": 0.20,               # free_spins kernel target
        "hnw": 0.40,              # hold_and_win kernel target
        # ... any other component → kernel mapping
      },
      "triggers": {
        "fs":  { "p": 0.0085 },
        "hnw": { "p": 0.0090 },
      },
      "fs_session":  { "E": 23.6, "std": 26.6, "avgActualSpins": 16, ... },
      "hnw_session": { "E": 44.0, "std": 78.0, ... }
    }

A game that has only `fs` (no H&W) just omits the hnw_* fields; the
builder skips kernels with no source data.
"""
from __future__ import annotations

from math import comb
from typing import Any

# Component-name → (kernel_id, kernel_role) mapping.
# The composer dispatches kernels via `tools/par_to_ir/dispatcher.py`;
# this mapping tells us which CF component each kernel should match.
COMPONENT_TO_KERNEL: dict[str, str] = {
    "fs": "expanding_symbol",
    "hnw": "hold_and_win",
    "cascade": "cascade",
    "wheel": "wheel",
    "buy_feature": "buy_feature",
    "charge_meter": "charge_meter",
    "must_hit_by": "must_hit_by",
    "money_collect": "money_collect",
}

# Delegated-baseline components: not modeled by W244 kernels here,
# carried as a fixed RTP offset (per-line enumeration, scatter pays,
# lightning uplifts — game-specific math that doesn't fit a generic kernel).
DELEGATED_COMPONENTS = ("base_line", "scatter_pay_base", "lightning_uplift")


def _solve_p_cell_for_trigger(
    target_trigger_p: float,
    n_cells: int = 15,
    k_min: int = 6,
) -> float:
    """Bisection-solve P(≥k_min orbs in n_cells with p_cell) = target_trigger_p."""
    if target_trigger_p <= 0:
        return 0.0

    def p_trigger(pc: float) -> float:
        return sum(comb(n_cells, k) * (pc ** k) * ((1 - pc) ** (n_cells - k))
                   for k in range(k_min, n_cells + 1))

    lo, hi = 0.001, 0.5
    for _ in range(80):
        mid = (lo + hi) / 2
        if p_trigger(mid) < target_trigger_p:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def _solve_expanding_pay_table(
    target_rtp: float,
    fs_trigger_p: float,
    avg_spins: int,
    p_cell: float = 0.12,
    reels: int = 5,
    rows: int = 3,
) -> dict[int, float]:
    """Back-solve a Book-style pay_table that yields target_rtp."""
    p_reel = 1.0 - (1.0 - p_cell) ** rows
    p_exact = [
        comb(reels, r) * (p_reel ** r) * ((1 - p_reel) ** (reels - r))
        for r in range(reels + 1)
    ]
    # Unit pay schedule: only reels ≥ 3 pay (Book-of-Dead style),
    # multipliers 1× / 4× / 20× for 3, 4, 5 reels.
    e_per_unit = 1.0 * p_exact[3] + 4.0 * p_exact[4] + 20.0 * p_exact[5]
    if fs_trigger_p <= 0 or avg_spins <= 0 or e_per_unit <= 0 or target_rtp <= 0:
        return {3: 0.0, 4: 0.0, 5: 0.0}
    k_unit = target_rtp / (fs_trigger_p * avg_spins * e_per_unit)
    return {3: 1.0 * k_unit, 4: 4.0 * k_unit, 5: 20.0 * k_unit}


def build_generic_params(
    kernel_id: str,
    ir: dict[str, Any],
    par: dict[str, Any] | None,
    cf: dict[str, Any] | None = None,
) -> Any:
    """Build kernel params from a generic IR + CF source.

    Args:
        kernel_id: which kernel to build params for
        ir: Game IR dict (used for topology if needed)
        par: canonical PAR dict (used for limits if no cf)
        cf: closed-form RTP source — REQUIRED for non-trivial kernels.
            Passed via `params_builder = functools.partial(build_generic_params, cf=cf)`.

    Returns:
        Kernel-specific params dataclass, or None if this kernel cannot
        be configured from the available source (composer treats None as
        "delegated to game-specific math").
    """
    if cf is None:
        return None

    components = cf.get("components", {})
    triggers = cf.get("triggers", {})

    # ── lines/base evaluator (NOW HANDLED by lines_eval kernel) ──
    # The dispatcher routes evaluation.lines → asymmetric_paytable, but
    # the actual numeric work happens in tools/par_kernels/lines_eval.py
    # which does exact 14⁵ enumeration over weighted reels. We return
    # None here so the composer treats it as a "kernel-internal handled"
    # entry; the lines_eval result is added by the caller via
    # `lines_eval_rtp_from_ir(ir)` (see CLI / multi-game tests).
    if kernel_id == "asymmetric_paytable":
        return None

    # ── expanding_symbol (free_spins) ──────────────────────────────
    if kernel_id == "expanding_symbol":
        from slot_math_kernels.expanding_symbol import ExpandingSymbolParams
        fs_p = triggers.get("fs", {}).get("p", 0.0)
        components_fs = components.get("fs", 0.0)
        fs_session = cf.get("fs_session", {})
        avg_spins = max(int(fs_session.get("avgActualSpins", 16)), 1)

        if fs_p <= 0 or components_fs <= 0:
            return None

        pay_table = _solve_expanding_pay_table(
            target_rtp=components_fs,
            fs_trigger_p=fs_p,
            avg_spins=avg_spins,
            p_cell=0.12,
        )
        return ExpandingSymbolParams(
            fs_trigger_p=fs_p,
            fs_initial_spins=avg_spins,
            reels=5,
            rows=3,
            p_per_cell_in_fs=0.12,
            pay_table=pay_table,
            symbol_name="GENERIC_PROXY",
        )

    # ── hold_and_win ──────────────────────────────────────────────
    if kernel_id == "hold_and_win":
        from slot_math_kernels.hold_and_win import HoldAndWinParams
        from slot_math_kernels.money_collect import (
            MoneyCollectParams,
            money_collect_rtp_contribution,
        )
        from slot_math_kernels.must_hit_by import MustHitByPot

        hnw_p = triggers.get("hnw", {}).get("p", 0.0)
        components_hnw = components.get("hnw", 0.0)
        if hnw_p <= 0 or components_hnw <= 0:
            return None

        n_cells = 15
        k_min = 6
        p_cell = _solve_p_cell_for_trigger(hnw_p, n_cells=n_cells, k_min=k_min)

        # Probe with avg_value=1 → back-solve scaling.
        probe = MoneyCollectParams(
            p_per_cell=p_cell, n_cells=n_cells, trigger_count_min=k_min,
            value_table={1.0: 1.0}, respins_reset=3, grid_cap=n_cells,
        )
        unit_rtp = money_collect_rtp_contribution(probe)["rtp_contribution"]
        avg_value = (components_hnw / unit_rtp) if unit_rtp > 0 else 1.0

        money_params = MoneyCollectParams(
            p_per_cell=p_cell, n_cells=n_cells, trigger_count_min=k_min,
            value_table={avg_value: 1.0}, respins_reset=3, grid_cap=n_cells,
        )

        # Neuter jackpot pots — CF already folds jackpot into components.hnw.
        pots = (
            MustHitByPot(name="MINI",  seed_x_bet=10.0,   contribution_x=1e-9,
                         must_hit_by_x_bet=1e9, p_strike_per_spin=1e-15),
            MustHitByPot(name="MINOR", seed_x_bet=50.0,   contribution_x=1e-9,
                         must_hit_by_x_bet=1e9, p_strike_per_spin=1e-15),
            MustHitByPot(name="MAJOR", seed_x_bet=500.0,  contribution_x=1e-9,
                         must_hit_by_x_bet=1e9, p_strike_per_spin=1e-15),
            MustHitByPot(name="GRAND", seed_x_bet=5000.0, contribution_x=1e-9,
                         must_hit_by_x_bet=1e9, p_strike_per_spin=1e-15),
        )
        return HoldAndWinParams(money_params=money_params, jackpot_pots=pots)

    return None


def delegated_baseline_rtp(cf: dict[str, Any]) -> float:
    """Sum of CF components NOT modeled by W244 kernels.

    Excludes base_line (lines_eval), scatter_pay_base (scatter_pay kernel),
    lightning_uplift (lightning_uplift kernel) — those are now first-class
    W244 kernels.
    """
    c = cf.get("components", {})
    # All previously-delegated components are now handled by kernels.
    # Return 0 unless future CF schemas add new delegated slices.
    handled = {"base_line", "scatter_pay_base", "lightning_uplift"}
    return sum(v for name, v in c.items()
               if name in DELEGATED_COMPONENTS and name not in handled)


def scatter_pay_rtp_from_ir(ir: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    """Run scatter_pay kernel on an IR. Returns (rtp, full_result) or (0, {})."""
    from tools.par_kernels.scatter_pay import (
        build_scatter_pay_params_from_ir, scatter_pay_rtp,
    )
    p = build_scatter_pay_params_from_ir(ir)
    if p is None:
        return 0.0, {}
    r = scatter_pay_rtp(p)
    return r["rtp_contribution"], r


def lightning_uplift_rtp_from_ir(
    ir: dict[str, Any], base_rtp: float,
) -> tuple[float, dict[str, Any]]:
    """Run lightning_uplift kernel on an IR. Returns (rtp, full_result) or (0, {})."""
    from tools.par_kernels.lightning_uplift import (
        build_lightning_params_from_ir, lightning_uplift_rtp,
    )
    p = build_lightning_params_from_ir(ir, base_rtp=base_rtp)
    if p is None:
        return 0.0, {}
    r = lightning_uplift_rtp(p)
    return r["rtp_contribution"], r


def lines_eval_rtp_from_ir(ir: dict[str, Any]) -> tuple[float, dict[str, Any]]:
    """Run the per-line enumerator on an IR. Returns (rtp, full_result)."""
    from tools.par_kernels.lines_eval import (
        build_lines_params_from_ir, lines_eval_rtp,
    )
    params = build_lines_params_from_ir(ir)
    if params is None:
        return 0.0, {}
    result = lines_eval_rtp(params)
    return result["rtp_contribution"], result


def make_params_builder(cf: dict[str, Any]):
    """Convenience: return a closure suitable as `composer.compose(params_builder=...)`."""
    def builder(kernel_id: str, ir: dict[str, Any], par: dict[str, Any] | None):
        return build_generic_params(kernel_id, ir, par, cf=cf)
    return builder
