"""W244 wave 32 — analytic partial derivatives for W244 math kernels.

Pure-stdlib closed-form ∂RTP/∂param for the key W244 kernels. Used by
`tools.math_dsl.inverse_solver` for Newton-Raphson auto-resolution of
designer-spec target metrics → kernel parameters.

Each kernel exposes a `grad_*` function returning the partial derivative
of RTP with respect to a single named parameter. The remaining parameters
are held fixed (operator-supplied).

Why not SymPy?
  * SymPy is a 80 MB optional dep with cold-start overhead
  * Our RTP formulas are mostly Linear + Binomial + Geometric — all
    have well-known analytic derivatives
  * Pure-Python handcrafted is faster, no install, no surprises
  * Auditor can verify the derivative formula by inspecting source

Covered kernels (gradient w.r.t. canonical tuning parameter):
  * charge_meter            ∂RTP / ∂expected_charge_per_spin
  * money_collect           ∂RTP / ∂p_per_cell  (numerical via DP delta)
  * must_hit_by             ∂RTP / ∂contribution_x  (analytic = 1)
  * cascade                 ∂RTP / ∂p_win_per_cascade
  * expanding_symbol        ∂RTP / ∂p_per_cell_in_fs
  * persistent_multiplier   ∂RTP / ∂p_bump_per_spin
  * wheel                   ∂RTP / ∂trigger_p (trivial = E[award_per_trigger])
  * stacked_wilds           ∂RTP / ∂p_stacked_per_reel
  * pay_anywhere            ∂RTP / ∂p_per_cell
  * both_ways               ∂RTP / ∂line_pay_share  (linear)
"""
from __future__ import annotations

from typing import Callable

from tools.math_dsl.charge_meter import ChargeMeterParams
from tools.math_dsl.must_hit_by import MustHitByParams
from tools.math_dsl.cascade import CascadeParams
from tools.math_dsl.expanding_symbol import ExpandingSymbolParams, expanding_symbol_rtp
from tools.math_dsl.wheel import WheelParams, wheel_rtp
from tools.math_dsl.stacked_wilds import StackedWildsParams, stacked_wilds_rtp
from tools.math_dsl.pay_anywhere import PayAnywhereParams, pay_anywhere_rtp
from tools.math_dsl.both_ways import BothWaysParams


# ─── Charge meter ─────────────────────────────────────────────────────


def grad_charge_meter_d_expected_charge(params: ChargeMeterParams) -> float:
    """∂RTP / ∂expected_charge_per_spin.

    Closed-form: RTP = E[charge] × sum_t(award_t / threshold_t)
    → ∂RTP/∂E[charge] = sum_t(award_t / threshold_t).

    Linear in E[charge_per_spin], so gradient is constant w.r.t. it.
    """
    s = 0.0
    for tier in params.tiers:
        s += tier.award_value_x_bet / tier.threshold
    return s


# ─── Must hit by ──────────────────────────────────────────────────────


def grad_must_hit_by_d_contribution(
    pot_index: int, params: MustHitByParams,
) -> float:
    """∂RTP / ∂contribution_x for one pot (others fixed).

    Conservation flow: RTP = sum(contribution_x) → derivative is 1.0 for
    the target pot, 0.0 for others.
    """
    if pot_index < 0 or pot_index >= len(params.pots):
        raise IndexError(f"pot_index {pot_index} out of range")
    return 1.0


# ─── Cascade ──────────────────────────────────────────────────────────


def grad_cascade_d_p_win_per_cascade(params: CascadeParams) -> float:
    """∂RTP / ∂p_win_per_cascade.

    RTP = p_init × sum_{n=1..N}(p^(n-1) × base × mult[n])

    ∂/∂p:
      term_n derivative = (n-1) × p^(n-2) × base × mult[n]  (for n ≥ 2)
      term_1 (n=1) constant → 0

    Total:
      ∂RTP/∂p = p_init × sum_{n=2..N}((n-1) × p^(n-2) × base × mult[n])
    """
    total = 0.0
    p = params.p_win_per_cascade
    for n in range(2, params.max_chain + 1):
        idx = min(n - 1, len(params.multiplier_ladder) - 1)
        mult = params.multiplier_ladder[idx]
        if p == 0.0 and n - 2 > 0:
            term = 0.0
        else:
            term = (n - 1) * (p ** (n - 2)) * params.base_pay_per_cascade_x_bet * mult
        total += term
    return params.p_initial_win * total


# ─── Wheel ────────────────────────────────────────────────────────────


def grad_wheel_d_trigger_p(params: WheelParams) -> float:
    """∂RTP / ∂trigger_p = E[award_per_trigger] (linear in trigger_p)."""
    r = wheel_rtp(params)
    return r["expected_award_per_trigger"]


# ─── Both ways ────────────────────────────────────────────────────────


def grad_both_ways_d_line_share(params: BothWaysParams) -> float:
    """∂RTP / ∂line_pay_share = ltr_only_rtp (linear)."""
    return params.ltr_only_rtp


# ─── Pay anywhere ─────────────────────────────────────────────────────


def grad_pay_anywhere_d_p_per_cell(
    params: PayAnywhereParams, h: float = 1e-7,
) -> float:
    """∂RTP / ∂p_per_cell via central finite difference.

    Closed-form would require ∂Binomial/∂p which is analytical but
    notationally heavy. Central difference (O(h²) accurate) is precise
    enough for designer auto-resolution (typical tolerance 1e-4).
    """
    p = params.p_per_cell
    if p - h < 0:
        h = min(h, p / 2)
    if p + h > 1:
        h = min(h, (1 - p) / 2)
    p_plus = PayAnywhereParams(
        n_cells=params.n_cells, p_per_cell=p + h,
        pay_table=params.pay_table,
        min_pay_count=params.min_pay_count,
        symbol_name=params.symbol_name,
    )
    p_minus = PayAnywhereParams(
        n_cells=params.n_cells, p_per_cell=max(0.0, p - h),
        pay_table=params.pay_table,
        min_pay_count=params.min_pay_count,
        symbol_name=params.symbol_name,
    )
    rtp_plus = pay_anywhere_rtp(p_plus)["rtp_contribution"]
    rtp_minus = pay_anywhere_rtp(p_minus)["rtp_contribution"]
    return (rtp_plus - rtp_minus) / (2 * h)


# ─── Stacked wilds ────────────────────────────────────────────────────


def grad_stacked_wilds_d_p_stacked(
    params: StackedWildsParams, h: float = 1e-7,
) -> float:
    """∂RTP / ∂p_stacked_per_reel via central finite difference.

    Binomial PMF derivative is analytical:
      ∂PMF(k) / ∂p = PMF(k) × (k/p - (n-k)/(1-p))

    Numerical version is simpler and equally accurate at this scale.
    """
    p = params.p_stacked_per_reel
    if p - h < 0:
        h = min(h, max(1e-12, p / 2))
    if p + h > 1:
        h = min(h, max(1e-12, (1 - p) / 2))
    p_plus = StackedWildsParams(
        n_reels=params.n_reels, p_stacked_per_reel=p + h,
        pay_per_stacked_count=params.pay_per_stacked_count,
    )
    p_minus = StackedWildsParams(
        n_reels=params.n_reels,
        p_stacked_per_reel=max(0.0, p - h),
        pay_per_stacked_count=params.pay_per_stacked_count,
    )
    rtp_plus = stacked_wilds_rtp(p_plus)["rtp_contribution"]
    rtp_minus = stacked_wilds_rtp(p_minus)["rtp_contribution"]
    return (rtp_plus - rtp_minus) / (2 * h)


# ─── Expanding symbol ─────────────────────────────────────────────────


def grad_expanding_symbol_d_p_per_cell(
    params: ExpandingSymbolParams, h: float = 1e-7,
) -> float:
    """∂RTP / ∂p_per_cell_in_fs via central finite difference."""
    p = params.p_per_cell_in_fs
    if p - h < 0:
        h = min(h, max(1e-12, p / 2))
    if p + h > 1:
        h = min(h, max(1e-12, (1 - p) / 2))
    p_plus = ExpandingSymbolParams(
        fs_trigger_p=params.fs_trigger_p,
        fs_initial_spins=params.fs_initial_spins,
        reels=params.reels, rows=params.rows,
        p_per_cell_in_fs=p + h,
        pay_table=params.pay_table,
        symbol_name=params.symbol_name,
    )
    p_minus = ExpandingSymbolParams(
        fs_trigger_p=params.fs_trigger_p,
        fs_initial_spins=params.fs_initial_spins,
        reels=params.reels, rows=params.rows,
        p_per_cell_in_fs=max(0.0, p - h),
        pay_table=params.pay_table,
        symbol_name=params.symbol_name,
    )
    rtp_plus = expanding_symbol_rtp(p_plus)["rtp_contribution"]
    rtp_minus = expanding_symbol_rtp(p_minus)["rtp_contribution"]
    return (rtp_plus - rtp_minus) / (2 * h)


# ─── Generic finite difference helper ─────────────────────────────────


def numerical_gradient(
    rtp_func: Callable[[float], float],
    param_value: float,
    h: float = 1e-7,
    lo_bound: float = 0.0,
    hi_bound: float = 1.0,
) -> float:
    """Central finite-difference gradient for any single-parameter RTP function.

    Bounds-aware: clips `h` if param_value is near 0 or 1.
    """
    if param_value - h < lo_bound:
        h = max(1e-12, (param_value - lo_bound) / 2)
    if param_value + h > hi_bound:
        h = min(h, max(1e-12, (hi_bound - param_value) / 2))
    return (rtp_func(param_value + h) - rtp_func(param_value - h)) / (2 * h)
