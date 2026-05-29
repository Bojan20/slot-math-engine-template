"""P1.6 batches 21-22 — 8 more math-distinct kernels.

Families:
  • Batch 21: Negative Hypergeometric, Zipf-rank, Fréchet EVT, Dirichlet
  • Batch 22: Ornstein-Uhlenbeck, Hidden Markov mode, Branching+immigration, Brownian bankroll
"""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

from tools.solvers.negative_hypergeometric_first_k import (
    NegHyperFirstKParams, analytical_rtp as nhg_rtp,
    mc_simulate as nhg_mc, expected_draws, variance_draws,
)
from tools.solvers.zipf_paytable_rank import (
    ZipfPaytableParams, analytical_rtp as zipf_rtp,
    mc_simulate as zipf_mc, expected_pay as zipf_expected_pay,
)
from tools.solvers.frechet_heavy_tail_max import (
    FrechetMaxParams, mc_simulate as frechet_mc, expected_max, variance_max,
)
from tools.solvers.dirichlet_segment_weights import (
    DirichletSegmentParams, analytical_rtp as dirichlet_rtp,
    mc_simulate as dirichlet_mc, expected_pay as dirichlet_expected_pay,
    variance_pay as dirichlet_variance_pay,
)
from tools.solvers.ornstein_uhlenbeck_meter import (
    OrnsteinUhlenbeckParams, expected_level, variance_level,
    stationary_mean, stationary_variance,
)
from tools.solvers.hidden_markov_mode import (
    HiddenMarkovModeParams, analytical_rtp as hmm_rtp,
    mc_simulate as hmm_mc, stationary_distribution,
    long_run_trigger_rate,
)
from tools.solvers.branching_with_immigration import (
    BranchingImmigrationParams, analytical_rtp as bri_rtp,
    mc_simulate as bri_mc, stationary_population,
    expected_total_clusters,
)
from tools.solvers.brownian_bankroll_absorption import (
    BrownianBankrollParams, analytical_rtp as bba_rtp,
    prob_reach_target,
)


# ─── Batch 21 ──────────────────────────────────────────────────────


class TestNegHypergeometric(unittest.TestCase):
    REF = NegHyperFirstKParams(n_total=20, k_winners=5, pay_per_draw=1.0)

    def test_expected_draws(self):
        # 5 · 21 / 6 = 17.5
        self.assertAlmostEqual(expected_draws(self.REF), 17.5)

    def test_variance_positive(self):
        self.assertGreater(variance_draws(self.REF), 0)

    def test_mc_within_tolerance(self):
        a = nhg_rtp(self.REF)
        mc = nhg_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.95)
        self.assertLess(ratio, 1.05)


class TestZipfPaytable(unittest.TestCase):
    REF = ZipfPaytableParams(
        n_rows=10, s_exponent=1.5, a_pay_exponent=1.0, pay_base=10.0,
    )

    def test_expected_pay_positive(self):
        self.assertGreater(zipf_expected_pay(self.REF), 0)

    def test_rtp_increases_with_pay_exponent(self):
        a = zipf_expected_pay(self.REF)
        b = zipf_expected_pay(ZipfPaytableParams(
            n_rows=10, s_exponent=1.5, a_pay_exponent=2.0, pay_base=10.0,
        ))
        self.assertGreater(b, a)

    def test_mc_within_tolerance(self):
        a = zipf_rtp(self.REF)
        mc = zipf_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestFrechetMax(unittest.TestCase):
    REF = FrechetMaxParams(n_spins=1000, alpha=3.0, s_scale=10.0, m_location=0.0)

    def test_expected_max_finite_when_alpha_above_1(self):
        v = expected_max(self.REF)
        self.assertGreater(v, 0)
        self.assertLess(v, float("inf"))

    def test_alpha_below_1_diverges(self):
        p = FrechetMaxParams(n_spins=1000, alpha=0.5, s_scale=10.0)
        self.assertEqual(expected_max(p), float("inf"))

    def test_variance_alpha_below_2_diverges(self):
        p = FrechetMaxParams(n_spins=1000, alpha=1.5, s_scale=10.0)
        self.assertEqual(variance_max(p), float("inf"))

    def test_mc_finite(self):
        mc = frechet_mc(self.REF, sessions=5_000, seed=42)
        self.assertGreater(mc["rtp_mc"], 0)
        self.assertLess(mc["rtp_mc"], 1e6)


class TestDirichletSegment(unittest.TestCase):
    REF = DirichletSegmentParams(
        alphas=[2.0, 3.0, 5.0],
        segment_pays=[1.0, 5.0, 20.0],
    )

    def test_expected_pay(self):
        # weights: 2/10, 3/10, 5/10 → 0.2 + 1.5 + 10 = 11.7
        self.assertAlmostEqual(dirichlet_expected_pay(self.REF), 11.7)

    def test_variance_positive(self):
        self.assertGreater(dirichlet_variance_pay(self.REF), 0)

    def test_mc_within_tolerance(self):
        a = dirichlet_rtp(self.REF)
        mc = dirichlet_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


# ─── Batch 22 ──────────────────────────────────────────────────────


class TestOU(unittest.TestCase):
    REF = OrnsteinUhlenbeckParams(
        theta=0.5, mu_target=10.0, sigma=1.0, x0=5.0, horizon_T=2.0,
        pay_per_unit=1.0,
    )

    def test_expected_level_drifts_toward_mu(self):
        import math
        # μ + (x0 - μ) · exp(-θT) = 10 + (5 - 10) · exp(-1) = 10 - 5·e^(-1)
        expected = 10.0 - 5.0 * math.exp(-1.0)
        self.assertAlmostEqual(expected_level(self.REF), expected, places=6)

    def test_variance_grows_finite(self):
        v = variance_level(self.REF)
        # Should be < stationary variance σ²/(2θ) = 1
        self.assertGreater(v, 0)
        self.assertLess(v, 1.0)

    def test_stationary_metrics(self):
        self.assertAlmostEqual(stationary_mean(self.REF), 10.0)
        self.assertAlmostEqual(stationary_variance(self.REF), 1.0)


class TestHMM(unittest.TestCase):
    REF = HiddenMarkovModeParams(
        p_hot_to_cold=0.1, p_cold_to_hot=0.05,
        rate_hot=0.5, rate_cold=0.05, pay_per_trigger=1.0,
    )

    def test_stationary_distribution(self):
        pi_hot, pi_cold = stationary_distribution(self.REF)
        # π_hot = 0.05 / (0.1 + 0.05) = 1/3
        self.assertAlmostEqual(pi_hot, 1 / 3, places=6)
        self.assertAlmostEqual(pi_cold, 2 / 3, places=6)

    def test_long_run_rate(self):
        # 1/3 · 0.5 + 2/3 · 0.05 = 0.1666 + 0.0333 = 0.2
        self.assertAlmostEqual(long_run_trigger_rate(self.REF), 0.2, places=6)

    def test_mc_within_tolerance(self):
        a = hmm_rtp(self.REF)
        mc = hmm_mc(self.REF, spins=200_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestBranchingImmigration(unittest.TestCase):
    REF = BranchingImmigrationParams(
        p_trigger=0.20, offspring_mean=0.5, immigration_mean=1.0,
        n_generations=10, pay_per_cluster=1.0,
    )

    def test_stationary_population(self):
        # ν / (1 - m) = 1 / 0.5 = 2
        self.assertAlmostEqual(stationary_population(self.REF), 2.0)

    def test_total_clusters_finite(self):
        v = expected_total_clusters(self.REF)
        self.assertGreater(v, 0)
        # Bounded by n_generations · stationary = 20
        self.assertLess(v, 25.0)

    def test_mc_within_tolerance(self):
        a = bri_rtp(self.REF)
        mc = bri_mc(self.REF, spins=10_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.80)
        self.assertLess(ratio, 1.20)


class TestBrownianBankroll(unittest.TestCase):
    REF = BrownianBankrollParams(
        starting_balance=10.0, target_balance=20.0,
        mu_drift=0.0, sigma=1.0, pay_on_target=50.0,
    )

    def test_fair_walk_linear_prob(self):
        # μ = 0 → P = 10/20 = 0.5
        self.assertAlmostEqual(prob_reach_target(self.REF), 0.5)

    def test_negative_drift_lowers_prob(self):
        p_neg = BrownianBankrollParams(
            starting_balance=10.0, target_balance=20.0,
            mu_drift=-0.05, sigma=1.0, pay_on_target=50.0,
        )
        self.assertLess(prob_reach_target(p_neg), 0.5)

    def test_positive_drift_raises_prob(self):
        p_pos = BrownianBankrollParams(
            starting_balance=10.0, target_balance=20.0,
            mu_drift=0.05, sigma=1.0, pay_on_target=50.0,
        )
        self.assertGreater(prob_reach_target(p_pos), 0.5)

    def test_analytical_rtp_matches_pay_times_prob(self):
        # P · pay = 0.5 · 50 = 25
        self.assertAlmostEqual(bba_rtp(self.REF), 25.0)


if __name__ == "__main__":
    unittest.main()
