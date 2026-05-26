"""P1.6 batch 23 — final 5 kernels to reach 100 closed-form solvers.

Families:
  • Coupon Collector (Coupon collector problem)
  • Birthday Collision (Birthday paradox)
  • Inverse Gaussian First-Passage Time
  • Chinese Restaurant Process (exchangeable partition)
  • Lévy α-Stable (heavy-tail jackpot)
"""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.coupon_collector_complete import (
    CouponCollectorParams, analytical_rtp as cc_rtp,
    mc_simulate as cc_mc, expected_spins_to_complete,
    variance_spins_to_complete, harmonic_number,
)
from tools.solvers.birthday_collision import (
    BirthdayCollisionParams, analytical_rtp as bday_rtp,
    mc_simulate as bday_mc, prob_no_collision, prob_collision,
)
from tools.solvers.inverse_gaussian_fpt import (
    InverseGaussianFPTParams, analytical_rtp as ig_rtp,
    mc_simulate as ig_mc, expected_fpt, variance_fpt,
)
from tools.solvers.chinese_restaurant_partition import (
    CRPPartitionParams, analytical_rtp as crp_rtp,
    mc_simulate as crp_mc, expected_n_clusters,
    expected_n_clusters_asymptotic,
)
from tools.solvers.levy_stable_jackpot import (
    LevyStableJackpotParams, analytical_rtp as ls_rtp,
    mc_simulate as ls_mc, tail_constant,
    prob_exceeds, expected_jackpot_finite,
)


class TestCouponCollector(unittest.TestCase):
    REF = CouponCollectorParams(n_distinct=10, pay_on_complete=100.0)

    def test_harmonic_5(self):
        # H_5 = 1 + 0.5 + 0.333 + 0.25 + 0.2 = 2.283
        self.assertAlmostEqual(harmonic_number(5), 1 + 0.5 + 1/3 + 0.25 + 0.2, places=6)

    def test_expected_spins(self):
        # 10 · H_10 ≈ 29.29
        h10 = harmonic_number(10)
        self.assertAlmostEqual(expected_spins_to_complete(self.REF), 10 * h10, places=6)

    def test_variance_positive(self):
        self.assertGreater(variance_spins_to_complete(self.REF), 0)

    def test_mc_within_tolerance(self):
        a = cc_rtp(self.REF)
        mc = cc_mc(self.REF, sessions=10_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestBirthdayCollision(unittest.TestCase):
    REF = BirthdayCollisionParams(n_identities=365, k_draws=23, pay_on_collision=10.0)

    def test_classic_birthday_problem(self):
        # P(collision) for N=365, K=23 ≈ 0.5073
        p = prob_collision(self.REF)
        self.assertGreater(p, 0.50)
        self.assertLess(p, 0.51)

    def test_no_draws_no_collision(self):
        p = BirthdayCollisionParams(n_identities=365, k_draws=1, pay_on_collision=10.0)
        self.assertEqual(prob_collision(p), 0.0)

    def test_k_exceeds_n_certain_collision(self):
        p = BirthdayCollisionParams(n_identities=10, k_draws=20, pay_on_collision=10.0)
        self.assertAlmostEqual(prob_collision(p), 1.0)

    def test_mc_within_tolerance(self):
        a = bday_rtp(self.REF)
        mc = bday_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.95)
        self.assertLess(ratio, 1.05)


class TestInverseGaussianFPT(unittest.TestCase):
    REF = InverseGaussianFPTParams(
        mu_meantime=5.0, lambda_shape=10.0, pay_on_fill=100.0,
    )

    def test_expected_fpt_is_mu(self):
        self.assertAlmostEqual(expected_fpt(self.REF), 5.0)

    def test_variance_formula(self):
        # mu^3 / lambda = 125 / 10 = 12.5
        self.assertAlmostEqual(variance_fpt(self.REF), 12.5)

    def test_rtp_pay_per_unit_time(self):
        # 100 / 5 = 20
        self.assertAlmostEqual(ig_rtp(self.REF), 20.0)

    def test_mc_mean_close_to_mu(self):
        mc = ig_mc(self.REF, sessions=30_000, seed=42)
        self.assertGreater(mc["mean_fpt"], 4.0)
        self.assertLess(mc["mean_fpt"], 6.0)


class TestChineseRestaurantPartition(unittest.TestCase):
    REF = CRPPartitionParams(
        theta_concentration=2.0, n_customers=20, pay_per_cluster=1.0,
    )

    def test_expected_n_clusters_positive(self):
        v = expected_n_clusters(self.REF)
        self.assertGreater(v, 1.0)
        # Should be < N
        self.assertLess(v, 20.0)

    def test_asymptotic_close_to_exact_for_large_n(self):
        a = expected_n_clusters(self.REF)
        b = expected_n_clusters_asymptotic(self.REF)
        # Asymptotic underestimates slightly; agreement within 20%
        self.assertLess(abs(a - b) / a, 0.20)

    def test_higher_theta_more_clusters(self):
        a = expected_n_clusters(self.REF)
        b = expected_n_clusters(CRPPartitionParams(
            theta_concentration=5.0, n_customers=20, pay_per_cluster=1.0,
        ))
        self.assertGreater(b, a)

    def test_mc_within_tolerance(self):
        a = crp_rtp(self.REF)
        mc = crp_mc(self.REF, sessions=10_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestLevyStableJackpot(unittest.TestCase):
    REF = LevyStableJackpotParams(
        p_trigger=0.01, alpha=1.5, beta=0.0, sigma=1.0, x_min=10.0,
    )

    def test_tail_constant_positive_for_alpha_below_2(self):
        c = tail_constant(self.REF)
        self.assertGreater(c, 0)

    def test_tail_prob_decreases_with_x(self):
        a = prob_exceeds(self.REF, 10.0)
        b = prob_exceeds(self.REF, 100.0)
        self.assertGreater(a, b)

    def test_alpha_above_1_finite_mean(self):
        m = expected_jackpot_finite(self.REF)
        self.assertGreater(m, 0)
        self.assertLess(m, float("inf"))

    def test_alpha_below_1_infinite_mean(self):
        p = LevyStableJackpotParams(
            p_trigger=0.01, alpha=0.5, beta=0.0, sigma=1.0, x_min=10.0,
        )
        self.assertEqual(expected_jackpot_finite(p), float("inf"))

    def test_mc_finite(self):
        mc = ls_mc(self.REF, spins=30_000, seed=42)
        self.assertGreaterEqual(mc["rtp_mc"], 0)


if __name__ == "__main__":
    unittest.main()
