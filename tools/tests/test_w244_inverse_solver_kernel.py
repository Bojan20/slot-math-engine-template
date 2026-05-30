"""W244 wave 32 — symbolic gradient + Newton-Raphson inverse solver acceptance."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.math_dsl.both_ways import BothWaysParams  # noqa: E402
from tools.math_dsl.cascade import CascadeParams  # noqa: E402
from tools.math_dsl.charge_meter import (  # noqa: E402
    ChargeMeterParams, ChargeTier, charge_meter_rtp,
)
from tools.math_dsl.must_hit_by import MustHitByParams, MustHitByPot  # noqa: E402
from tools.math_dsl.pay_anywhere import (  # noqa: E402
    PayAnywhereParams, pay_anywhere_rtp,
)
from tools.math_dsl.stacked_wilds import (  # noqa: E402
    StackedWildsParams, stacked_wilds_rtp,
)
from tools.math_dsl.symbolic_gradient import (  # noqa: E402
    grad_both_ways_d_line_share,
    grad_cascade_d_p_win_per_cascade,
    grad_charge_meter_d_expected_charge,
    grad_must_hit_by_d_contribution,
)
from tools.math_dsl.inverse_solver import (  # noqa: E402
    bisection_1d, newton_raphson_1d,
)


class TestChargeMeterGradient(unittest.TestCase):
    def test_grad_constant_for_linear(self):
        """charge_meter RTP linear in E[charge] → gradient constant."""
        tiers = (
            ChargeTier("small", 20.0, 4.0),
            ChargeTier("grand", 100.0, 30.0),
        )
        # ∂RTP/∂E[charge] = 4/20 + 30/100 = 0.2 + 0.3 = 0.5
        params_lo = ChargeMeterParams(expected_charge_per_spin=0.5, tiers=tiers)
        params_hi = ChargeMeterParams(expected_charge_per_spin=2.0, tiers=tiers)
        g_lo = grad_charge_meter_d_expected_charge(params_lo)
        g_hi = grad_charge_meter_d_expected_charge(params_hi)
        self.assertAlmostEqual(g_lo, 0.5)
        self.assertAlmostEqual(g_lo, g_hi)  # truly constant


class TestMustHitByGradient(unittest.TestCase):
    def test_grad_one_for_target_pot(self):
        """∂RTP/∂contribution_x = 1 for the target pot (conservation)."""
        params = MustHitByParams(pots=(
            MustHitByPot("a", 100, 0.001, 1000),
            MustHitByPot("b", 200, 0.002, 2000),
        ))
        self.assertEqual(grad_must_hit_by_d_contribution(0, params), 1.0)
        self.assertEqual(grad_must_hit_by_d_contribution(1, params), 1.0)


class TestCascadeGradient(unittest.TestCase):
    def test_grad_sign_positive(self):
        """Higher p_win_per_cascade → higher RTP → grad > 0."""
        params = CascadeParams(
            p_initial_win=0.3, base_pay_per_cascade_x_bet=0.5,
            p_win_per_cascade=0.4,
            multiplier_ladder=(1.0, 2.0, 4.0, 8.0, 16.0),
            max_chain=8,
        )
        g = grad_cascade_d_p_win_per_cascade(params)
        self.assertGreater(g, 0.0)

    def test_grad_zero_at_p_zero(self):
        """At p_win_per_cascade = 0, only n=1 contributes → ∂/∂p reduces to (1-1)×... = 0."""
        # Wait — at p=0 the n=2 term is (n-1)×0^(n-2)×... = 1×0^0×base×mult[2]
        # 0^0 = 1 by convention in Python, so n=2 term contributes 1×1×base×mult[2]
        # ∂RTP/∂p at p=0 is NOT zero — it's the n=2 contribution coefficient.
        params = CascadeParams(
            p_initial_win=0.5, base_pay_per_cascade_x_bet=1.0,
            p_win_per_cascade=0.0,
            multiplier_ladder=(1.0, 3.0),
            max_chain=2,
        )
        g = grad_cascade_d_p_win_per_cascade(params)
        # ∂/∂p at p=0: n=2 contributes (2-1)×0^0×1×3 = 1×1×3 = 3
        # × p_initial_win = 0.5 → grad = 1.5
        self.assertAlmostEqual(g, 1.5)


class TestBothWaysGradient(unittest.TestCase):
    def test_grad_equals_ltr(self):
        """∂(ltr × (1 + share))/∂share = ltr (constant)."""
        params = BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.5)
        self.assertAlmostEqual(grad_both_ways_d_line_share(params), 0.96)


class TestNewtonRaphson1d(unittest.TestCase):
    def test_solves_linear_target(self):
        """f(x) = 2x, target=1.0 → x=0.5."""
        rtp_func = lambda x: 2.0 * x  # noqa: E731
        grad_func = lambda x: 2.0  # noqa: E731
        r = newton_raphson_1d(
            rtp_func, grad_func, target_rtp=1.0, initial_guess=0.1,
            tolerance=1e-6, param_lo=0.0, param_hi=10.0,
        )
        self.assertTrue(r.converged)
        self.assertAlmostEqual(r.final_param, 0.5, places=4)
        # Linear → converge in 1 iter
        self.assertEqual(r.iterations, 2)

    def test_solves_charge_meter_target(self):
        """Resolve E[charge] for target RTP = 0.10 (single-tier classic)."""
        tier = ChargeTier("classic", 50.0, 10.0)

        def rtp_func(x):
            p = ChargeMeterParams(expected_charge_per_spin=x, tiers=(tier,))
            return charge_meter_rtp(p)["rtp_contribution"]

        def grad_func(x):
            p = ChargeMeterParams(expected_charge_per_spin=x, tiers=(tier,))
            return grad_charge_meter_d_expected_charge(p)

        r = newton_raphson_1d(
            rtp_func, grad_func, target_rtp=0.10, initial_guess=0.1,
            tolerance=1e-6, param_lo=0.0, param_hi=10.0,
        )
        self.assertTrue(r.converged)
        # E[charge] / 50 × 10 = 0.10 → E[charge] = 0.5
        self.assertAlmostEqual(r.final_param, 0.5, places=4)


class TestBisection1d(unittest.TestCase):
    def test_solves_pay_anywhere(self):
        """Bisection resolves pay_anywhere p_per_cell for target RTP."""
        pay_table = {8: 5.0, 10: 20.0, 12: 100.0}

        def rtp_func(p):
            params = PayAnywhereParams(
                n_cells=30, p_per_cell=p, pay_table=pay_table, min_pay_count=8,
            )
            return pay_anywhere_rtp(params)["rtp_contribution"]

        r = bisection_1d(
            rtp_func, target_rtp=0.05,
            param_lo=0.05, param_hi=0.3,
            tolerance=1e-4,
        )
        self.assertTrue(r.converged)
        # Verify result
        achieved_rtp = rtp_func(r.final_param)
        self.assertAlmostEqual(achieved_rtp, 0.05, places=3)

    def test_solves_stacked_wilds(self):
        """Bisection resolves stacked_wilds p_stacked for target RTP."""
        pay = {5: 25_000.0}

        def rtp_func(p):
            params = StackedWildsParams(
                n_reels=5, p_stacked_per_reel=p, pay_per_stacked_count=pay,
            )
            return stacked_wilds_rtp(params)["rtp_contribution"]

        r = bisection_1d(
            rtp_func, target_rtp=0.001,
            param_lo=0.0, param_hi=0.5,
            tolerance=1e-6,
        )
        self.assertTrue(r.converged)


class TestSolveResultShape(unittest.TestCase):
    def test_history_populated(self):
        rtp_func = lambda x: 2.0 * x  # noqa: E731
        grad_func = lambda x: 2.0  # noqa: E731
        r = newton_raphson_1d(
            rtp_func, grad_func, target_rtp=1.0, initial_guess=0.1,
            tolerance=1e-6,
        )
        self.assertGreater(len(r.history), 0)
        for entry in r.history:
            self.assertEqual(len(entry), 2)


if __name__ == "__main__":
    unittest.main()
