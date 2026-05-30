#!/usr/bin/env python3
"""W244 wave 32 — acceptance: inverse solver auto-resolves designer targets."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.both_ways import BothWaysParams, both_ways_rtp
from tools.math_dsl.cascade import CascadeParams, cascade_rtp
from tools.math_dsl.charge_meter import ChargeMeterParams, ChargeTier, charge_meter_rtp
from tools.math_dsl.pay_anywhere import PayAnywhereParams, pay_anywhere_rtp
from tools.math_dsl.stacked_wilds import StackedWildsParams, stacked_wilds_rtp
from tools.math_dsl.symbolic_gradient import (
    grad_both_ways_d_line_share,
    grad_charge_meter_d_expected_charge,
)
from tools.math_dsl.inverse_solver import bisection_1d, newton_raphson_1d

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "INVERSE_SOLVER_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)


def _scenario_charge_meter_target_rtp(target_rtp: float):
    """Designer says: hit RTP=target via charge_meter E[charge]. Solver finds it."""
    tier = ChargeTier("classic", threshold=50.0, award_value_x_bet=10.0)

    def rtp_func(x):
        return charge_meter_rtp(
            ChargeMeterParams(expected_charge_per_spin=x, tiers=(tier,))
        )["rtp_contribution"]

    def grad_func(x):
        return grad_charge_meter_d_expected_charge(
            ChargeMeterParams(expected_charge_per_spin=x, tiers=(tier,))
        )

    return newton_raphson_1d(
        rtp_func, grad_func, target_rtp=target_rtp,
        initial_guess=0.1, tolerance=1e-6, param_lo=0.0, param_hi=10.0,
    )


def _scenario_both_ways_target(target_rtp: float):
    """Designer specifies: ltr=0.80, target both_ways RTP=target. Solver finds share."""
    ltr = 0.80

    def rtp_func(share):
        return both_ways_rtp(
            BothWaysParams(ltr_only_rtp=ltr, line_pay_share=share)
        )["rtp_contribution"]

    def grad_func(share):
        return grad_both_ways_d_line_share(
            BothWaysParams(ltr_only_rtp=ltr, line_pay_share=share)
        )

    return newton_raphson_1d(
        rtp_func, grad_func, target_rtp=target_rtp,
        initial_guess=0.5, tolerance=1e-6, param_lo=0.0, param_hi=1.0,
    )


def _scenario_pay_anywhere_p_per_cell(target_rtp: float):
    """Bisection solve for pay_anywhere p_per_cell (gradient unreliable at boundaries)."""
    pay_table = {8: 5.0, 10: 20.0, 12: 100.0}

    def rtp_func(p):
        return pay_anywhere_rtp(
            PayAnywhereParams(
                n_cells=30, p_per_cell=p,
                pay_table=pay_table, min_pay_count=8,
            )
        )["rtp_contribution"]

    return bisection_1d(
        rtp_func, target_rtp=target_rtp,
        param_lo=0.01, param_hi=0.5, tolerance=1e-5,
    )


def _scenario_stacked_wilds_p_stacked(target_rtp: float):
    """Bisection solve for stacked_wilds p_stacked_per_reel."""
    pay = {5: 25_000.0}

    def rtp_func(p):
        return stacked_wilds_rtp(
            StackedWildsParams(
                n_reels=5, p_stacked_per_reel=p,
                pay_per_stacked_count=pay,
            )
        )["rtp_contribution"]

    return bisection_1d(
        rtp_func, target_rtp=target_rtp,
        param_lo=0.0, param_hi=0.5, tolerance=1e-7,
    )


def _scenario_cascade_p_win(target_rtp: float):
    """Bisection on cascade p_win_per_cascade for target RTP."""
    multiplier_ladder = (1.0, 2.0, 4.0, 8.0, 16.0)

    def rtp_func(p):
        return cascade_rtp(
            CascadeParams(
                p_initial_win=0.25,
                base_pay_per_cascade_x_bet=0.4,
                p_win_per_cascade=p,
                multiplier_ladder=multiplier_ladder,
                max_chain=5,
            )
        )["rtp_contribution"]

    return bisection_1d(
        rtp_func, target_rtp=target_rtp,
        param_lo=0.0, param_hi=0.95, tolerance=1e-5,
    )


SCENARIOS = [
    ("charge-meter-target-0.10", "Newton-Raphson", lambda: _scenario_charge_meter_target_rtp(0.10)),
    ("charge-meter-target-0.20", "Newton-Raphson", lambda: _scenario_charge_meter_target_rtp(0.20)),
    ("both-ways-target-1.30",     "Newton-Raphson", lambda: _scenario_both_ways_target(1.30)),
    ("pay-anywhere-target-0.05",  "Bisection",      lambda: _scenario_pay_anywhere_p_per_cell(0.05)),
    ("stacked-wilds-target-0.001","Bisection",      lambda: _scenario_stacked_wilds_p_stacked(0.001)),
    ("cascade-target-0.20",       "Bisection",      lambda: _scenario_cascade_p_win(0.20)),
]


def main() -> int:
    records = []
    for name, method, fn in SCENARIOS:
        r = fn()
        records.append({
            "scenario_name": name,
            "method": method,
            "converged": r.converged,
            "iterations": r.iterations,
            "target_rtp": r.target_rtp,
            "final_param": r.final_param,
            "final_rtp": r.final_rtp,
            "error": r.error,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['scenario_name']}|"
            f"method={r['method']}|"
            f"target={r['target_rtp']:.15e}|"
            f"final_param={r['final_param']:.15e}|"
            f"converged={r['converged']}|"
            f"iters={r['iterations']}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    all_converged = all(r["converged"] for r in records)

    artifact = {
        "schema": "inverse-solver-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "inverse_solver",
        "modules": [
            "tools.math_dsl.symbolic_gradient",
            "tools.math_dsl.inverse_solver",
        ],
        "industry_pattern": (
            "Designer-target → kernel-parameter auto-resolution. Newton-"
            "Raphson with analytic gradient where available; bisection "
            "fallback for non-smooth or boundary-prone kernels. "
            "Replaces manual reel-weight tuning."
        ),
        "scenarios_count": len(SCENARIOS),
        "all_converged": all_converged,
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_inverse_solver_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Each scenario "
            "convergence is deterministic given the same initial guess + "
            "iteration cap."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[inverse-solver-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        sign = "✓" if r["converged"] else "✗"
        print(f"    {sign} {r['scenario_name']:32s}  {r['method']:14s}  "
              f"target={r['target_rtp']:.4f}  param={r['final_param']:.6f}  "
              f"iters={r['iterations']}")
    print(f"  merkle root: {merkle_root}")
    return 0 if all_converged else 1


if __name__ == "__main__":
    raise SystemExit(main())
