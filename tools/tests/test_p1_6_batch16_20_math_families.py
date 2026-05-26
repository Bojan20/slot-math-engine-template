"""P1.6 batches 16-20 — 20 mathematically-distinct kernels.

Families covered:
  • Batch 16: Negative Binomial, Hypergeometric, Martingale, Gumbel EVT
  • Batch 17: Compound Poisson, Galton-Watson branching, Markov absorption, Bayesian Beta update
  • Batch 18: Renewal process, Multinomial, First-passage time, Tail dependence
  • Batch 19: Expected shortfall (CVaR), Conditional expectation, Exponential decay, Logistic growth
  • Batch 20: Weibull, Pareto heavy-tail, Beta-Binomial overdispersion, Poisson mixture
"""
from __future__ import annotations
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT))

# Batch 16
from tools.solvers.negative_binomial_attempts import (
    NegBinomialAttemptsParams, analytical_rtp as nb_rtp,
    mc_simulate as nb_mc, expected_spins_to_fire,
)
from tools.solvers.hypergeometric_pick import (
    HypergeometricPickParams, analytical_rtp as hp_rtp,
    mc_simulate as hp_mc, prob_match,
)
from tools.solvers.martingale_double_bet import (
    MartingaleParams, analytical_rtp as mg_rtp,
    mc_simulate as mg_mc, prob_session_win, expected_net_per_session,
)
from tools.solvers.gumbel_extreme_win import (
    GumbelExtremeParams, analytical_rtp as gx_rtp,
    mc_simulate as gx_mc, expected_max_uncapped, prob_cap_hit,
)

# Batch 17
from tools.solvers.compound_poisson_bonus import (
    CompoundPoissonParams, analytical_rtp as cpb_rtp,
    mc_simulate as cpb_mc, expected_total_pay, variance_total_pay,
)
from tools.solvers.galton_watson_avalanche import (
    GaltonWatsonAvalancheParams, analytical_rtp as gwa_rtp,
    mc_simulate as gwa_mc, offspring_mean, expected_total_clusters,
)
from tools.solvers.markov_absorption_freespins import (
    MarkovAbsorptionFreespinsParams, analytical_rtp as mar_rtp,
    mc_simulate as mar_mc, expected_total_spins,
)
from tools.solvers.bayesian_skill_adaptation import (
    BayesianSkillAdaptParams, analytical_rtp as bsa_rtp,
    mc_simulate as bsa_mc, posterior_alpha_beta, posterior_mean,
)

# Batch 18
from tools.solvers.renewal_process_features import (
    RenewalProcessParams, analytical_rtp as rpf_rtp,
    mc_simulate as rpf_mc, long_run_rate,
    expected_features, variance_features,
)
from tools.solvers.multinomial_symbol_draws import (
    MultinomialSymbolDrawsParams, analytical_rtp as msd_rtp,
    mc_simulate as msd_mc, expected_pay_per_cell,
)
from tools.solvers.first_passage_time_meter import (
    FirstPassageMeterParams, analytical_rtp as fpt_rtp,
    mc_simulate as fpt_mc, expected_first_passage_time, prob_fill_within,
)
from tools.solvers.tail_dependence_jackpot import (
    TailDependenceJackpotParams, analytical_rtp as tdj_rtp,
    mc_simulate as tdj_mc, independence_rtp, tail_augmented_rtp,
)

# Batch 19
from tools.solvers.expected_shortfall_bigwin import (
    ExpectedShortfallParams, analytical_rtp as esb_rtp,
    mc_simulate as esb_mc, var_at_level, cvar,
)
from tools.solvers.conditional_expectation_session import (
    ConditionalSessionParams, analytical_rtp as ces_rtp,
    mc_simulate as ces_mc, conditional_expectation,
    conditional_variance, ci95_halfwidth,
)
from tools.solvers.exponential_decay_multiplier import (
    ExpDecayMultParams, analytical_rtp as edm_rtp,
    mc_simulate as edm_mc, expected_total_multiplier,
)
from tools.solvers.logistic_growth_meter import (
    LogisticMeterParams, analytical_rtp as lgm_rtp,
    mc_simulate as lgm_mc, meter_level,
)

# Batch 20
from tools.solvers.weibull_session_length import (
    WeibullSessionParams, analytical_rtp as wsl_rtp,
    mc_simulate as wsl_mc, expected_session_length,
)
from tools.solvers.pareto_jackpot_size import (
    ParetoJackpotParams, analytical_rtp as pjs_rtp,
    mc_simulate as pjs_mc, expected_jackpot, variance_jackpot,
    prob_exceeds_factor,
)
from tools.solvers.beta_binomial_overdispersion import (
    BetaBinomialParams, analytical_rtp as bbo_rtp,
    mc_simulate as bbo_mc, expected_successes, variance_successes,
    overdispersion_ratio,
)
from tools.solvers.poisson_mixture_features import (
    PoissonMixtureParams, analytical_rtp as pmf_rtp,
    mc_simulate as pmf_mc, expected_features as pmf_expected,
    variance_features as pmf_variance,
)


# ─── Batch 16 ──────────────────────────────────────────────────────


class TestNegBinomialAttempts(unittest.TestCase):
    REF = NegBinomialAttemptsParams(r_target=3, p_trigger=0.10, bonus_pay=100.0)

    def test_expected_spins_formula(self):
        self.assertAlmostEqual(expected_spins_to_fire(3, 0.10), 30.0)

    def test_rtp_inversely_proportional_to_r(self):
        a = nb_rtp(self.REF)
        b = nb_rtp(NegBinomialAttemptsParams(r_target=6, p_trigger=0.10, bonus_pay=100.0))
        self.assertAlmostEqual(b, a / 2, places=6)

    def test_mc_within_tolerance(self):
        a = nb_rtp(self.REF)
        mc = nb_mc(self.REF, spins=100_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestHypergeometricPick(unittest.TestCase):
    REF = HypergeometricPickParams(
        n_cells=10, k_winners=4, m_picks=3, min_match=3, pay_when_match=50.0,
    )

    def test_prob_match_bounded(self):
        p = prob_match(self.REF)
        self.assertGreater(p, 0)
        self.assertLess(p, 1)

    def test_pick_all_winners_gives_correct(self):
        # n=10, K=4, m=4, min=4 → C(4,4)·C(6,0)/C(10,4) = 1/210
        p = HypergeometricPickParams(
            n_cells=10, k_winners=4, m_picks=4, min_match=4, pay_when_match=1.0,
        )
        self.assertAlmostEqual(prob_match(p), 1 / 210, places=8)

    def test_mc_within_tolerance(self):
        a = hp_rtp(self.REF)
        mc = hp_mc(self.REF, spins=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestMartingale(unittest.TestCase):
    REF = MartingaleParams(p_win=0.45, max_steps=5)

    def test_prob_session_win_bounded(self):
        p = prob_session_win(self.REF)
        self.assertGreater(p, 0)
        self.assertLess(p, 1)

    def test_full_ladder_high_win_prob(self):
        # 5-step ladder at p=0.5 → P(win) = 1 - 0.5^5 = 31/32
        p = MartingaleParams(p_win=0.5, max_steps=5)
        self.assertAlmostEqual(prob_session_win(p), 31 / 32)

    def test_house_edge_at_50_pct_is_zero_ev(self):
        # At p=0.5 fair coin the expected NET should be near zero
        p = MartingaleParams(p_win=0.5, max_steps=5)
        self.assertAlmostEqual(expected_net_per_session(p), 0.0, places=4)


class TestGumbelExtreme(unittest.TestCase):
    REF = GumbelExtremeParams(n_spins=1000, mu=10.0, beta=2.0, cap=50.0)

    def test_expected_max_grows_with_n(self):
        a = expected_max_uncapped(GumbelExtremeParams(n_spins=100, mu=10.0, beta=2.0, cap=50.0))
        b = expected_max_uncapped(GumbelExtremeParams(n_spins=1000, mu=10.0, beta=2.0, cap=50.0))
        self.assertGreater(b, a)

    def test_cap_hit_low_when_cap_far(self):
        far = GumbelExtremeParams(n_spins=1000, mu=10.0, beta=2.0, cap=200.0)
        self.assertLess(prob_cap_hit(far), 0.001)

    def test_mc_within_tolerance(self):
        a = gx_rtp(self.REF)
        mc = gx_mc(self.REF, sessions=10_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


# ─── Batch 17 ──────────────────────────────────────────────────────


class TestCompoundPoisson(unittest.TestCase):
    REF = CompoundPoissonParams(
        lambda_per_session=3.0, mean_pay=5.0, var_pay=4.0, bet_per_session=1.0,
    )

    def test_expected_total(self):
        self.assertAlmostEqual(expected_total_pay(self.REF), 15.0)

    def test_variance_formula(self):
        # lambda · (mean^2 + var) = 3 · (25 + 4) = 87
        self.assertAlmostEqual(variance_total_pay(self.REF), 87.0)

    def test_mc_within_tolerance(self):
        a = cpb_rtp(self.REF)
        mc = cpb_mc(self.REF, sessions=50_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestGaltonWatson(unittest.TestCase):
    REF = GaltonWatsonAvalancheParams(
        p_initial=0.20,
        offspring_dist={0: 0.5, 1: 0.3, 2: 0.2},
        pay_per_cluster=1.0,
    )

    def test_offspring_mean(self):
        # 0·0.5 + 1·0.3 + 2·0.2 = 0.7
        self.assertAlmostEqual(offspring_mean(self.REF.offspring_dist), 0.7)

    def test_total_clusters_subcritical(self):
        # 1 / (1 - 0.7) = 3.333
        self.assertAlmostEqual(expected_total_clusters(self.REF), 1 / 0.3, places=4)

    def test_mc_within_tolerance(self):
        a = gwa_rtp(self.REF)
        mc = gwa_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestMarkovAbsorption(unittest.TestCase):
    REF = MarkovAbsorptionFreespinsParams(
        initial_spins=10, p_retrigger_per_spin=0.10,
        retrigger_award=5, base_pay_per_spin=1.0,
    )

    def test_zero_retrigger_collapses(self):
        p = MarkovAbsorptionFreespinsParams(
            initial_spins=10, p_retrigger_per_spin=0.0,
            retrigger_award=5, base_pay_per_spin=1.0,
        )
        # No retrigger → exactly 10 spins
        self.assertAlmostEqual(expected_total_spins(p), 10.0, places=2)

    def test_retrigger_extends_session(self):
        ts = expected_total_spins(self.REF)
        # Should be > 10 due to retriggers
        self.assertGreater(ts, 10.0)

    def test_mc_within_tolerance(self):
        a = mar_rtp(self.REF)
        mc = mar_mc(self.REF, sessions=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.85)
        self.assertLess(ratio, 1.15)


class TestBayesianSkill(unittest.TestCase):
    REF = BayesianSkillAdaptParams(
        prior_alpha=2.0, prior_beta=2.0, n_obs=10, k_wins=7, bonus_pay=10.0,
    )

    def test_posterior_pair(self):
        a, b = posterior_alpha_beta(self.REF)
        self.assertEqual(a, 9.0)
        self.assertEqual(b, 5.0)

    def test_posterior_mean(self):
        # 9 / (9 + 5) = 9/14
        self.assertAlmostEqual(posterior_mean(self.REF), 9 / 14, places=6)


# ─── Batch 18 ──────────────────────────────────────────────────────


class TestRenewalProcess(unittest.TestCase):
    REF = RenewalProcessParams(
        horizon=100, inter_arrival_mean=10.0, inter_arrival_var=4.0,
        pay_per_feature=1.0,
    )

    def test_long_run_rate(self):
        self.assertAlmostEqual(long_run_rate(self.REF), 0.1)

    def test_expected_features(self):
        self.assertAlmostEqual(expected_features(self.REF), 10.0)

    def test_mc_within_tolerance(self):
        a = rpf_rtp(self.REF)
        mc = rpf_mc(self.REF, sessions=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestMultinomialSymbol(unittest.TestCase):
    REF = MultinomialSymbolDrawsParams(
        p_trigger=0.10, n_cells=5,
        symbol_weights=[50, 30, 15, 4, 1],
        symbol_pays=[1.0, 2.0, 5.0, 10.0, 50.0],
    )

    def test_per_cell_expectation(self):
        e = expected_pay_per_cell(self.REF)
        # (50·1 + 30·2 + 15·5 + 4·10 + 1·50) / 100 = 275/100 = 2.75
        self.assertAlmostEqual(e, 2.75, places=4)

    def test_mc_within_tolerance(self):
        a = msd_rtp(self.REF)
        mc = msd_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestFirstPassage(unittest.TestCase):
    REF = FirstPassageMeterParams(
        threshold=10.0,
        step_probs={0: 0.5, 1: 0.3, 2: 0.15, 5: 0.05},
        max_spins=50,
        pay_on_fill=100.0,
    )

    def test_expected_first_passage_time(self):
        # E[step] = 0·0.5 + 1·0.3 + 2·0.15 + 5·0.05 = 0.85
        # E[τ] ≈ 10 / 0.85 ≈ 11.76
        self.assertAlmostEqual(expected_first_passage_time(self.REF), 10 / 0.85, places=4)

    def test_prob_fill_within_bounded(self):
        p = prob_fill_within(self.REF)
        self.assertGreater(p, 0)
        self.assertLessEqual(p, 1)


class TestTailDependence(unittest.TestCase):
    REF = TailDependenceJackpotParams(
        pool_probs=[0.01, 0.005, 0.001],
        pool_pays=[100.0, 500.0, 5000.0],
        lambda_upper=0.5,
        co_fire_bonus=1000.0,
    )

    def test_independence_baseline(self):
        # 0.01·100 + 0.005·500 + 0.001·5000 = 1 + 2.5 + 5 = 8.5
        self.assertAlmostEqual(independence_rtp(self.REF), 8.5)

    def test_tail_augmented_above_baseline(self):
        self.assertGreater(tail_augmented_rtp(self.REF), independence_rtp(self.REF))


# ─── Batch 19 ──────────────────────────────────────────────────────


class TestExpectedShortfall(unittest.TestCase):
    REF = ExpectedShortfallParams(
        pay_bins=[(0.0, 70), (1.0, 20), (10.0, 8), (100.0, 1.9), (1000.0, 0.1)],
        alpha=0.95,
    )

    def test_var_at_level(self):
        # 1 - 0.95 = 0.05 tail; cumulative from top: 0.001 + 0.019 = 0.020 (still in tail)
        # + 0.08 = 0.10 (exceeds 0.05). So VaR = 10.0.
        v = var_at_level(self.REF)
        self.assertEqual(v, 10.0)

    def test_cvar_above_var(self):
        c = cvar(self.REF)
        v = var_at_level(self.REF)
        self.assertGreaterEqual(c, v)


class TestConditionalSession(unittest.TestCase):
    REF = ConditionalSessionParams(
        n_total=100, spins_so_far=30, balance_so_far=5.0,
        mu_per_spin=-0.04, sigma2_per_spin=1.0,
    )

    def test_conditional_expectation(self):
        # 5 + 70 · (-0.04) = 5 - 2.8 = 2.2
        self.assertAlmostEqual(conditional_expectation(self.REF), 2.2, places=6)

    def test_conditional_variance(self):
        # 70 · 1 = 70
        self.assertAlmostEqual(conditional_variance(self.REF), 70.0)

    def test_ci95(self):
        self.assertGreater(ci95_halfwidth(self.REF), 0)


class TestExpDecayMultiplier(unittest.TestCase):
    REF = ExpDecayMultParams(
        p_trigger=0.10, m_initial=10.0, decay=0.5, n_respins=5, base_pay=1.0,
    )

    def test_total_mult_geometric(self):
        # 10 · (1 - 0.5^5) / (1 - 0.5) = 10 · (31/32) / 0.5 = 10 · 1.9375 = 19.375
        self.assertAlmostEqual(expected_total_multiplier(self.REF), 19.375)

    def test_decay_1_collapses_to_n(self):
        p = ExpDecayMultParams(
            p_trigger=0.10, m_initial=2.0, decay=1.0, n_respins=5, base_pay=1.0,
        )
        self.assertAlmostEqual(expected_total_multiplier(p), 10.0)

    def test_mc_within_tolerance(self):
        a = edm_rtp(self.REF)
        mc = edm_mc(self.REF, spins=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestLogisticMeter(unittest.TestCase):
    REF = LogisticMeterParams(
        p_trigger=0.10, K_capacity=100.0, r_growth=1.0, k0_midpoint=5.0,
        charges=10, pay_per_unit=1.0,
    )

    def test_meter_at_midpoint_is_half(self):
        # L(5) = 100 / 2 = 50
        self.assertAlmostEqual(meter_level(self.REF, 5.0), 50.0)

    def test_meter_at_large_k_near_K(self):
        # L(20) very close to 100
        self.assertGreater(meter_level(self.REF, 20.0), 99.0)


# ─── Batch 20 ──────────────────────────────────────────────────────


class TestWeibullSession(unittest.TestCase):
    REF = WeibullSessionParams(
        shape_k=2.0, scale_lambda=10.0,
        mean_rtp_per_spin=0.96, bet_per_spin=1.0,
    )

    def test_expected_session_length(self):
        # E[T] = 10 · Γ(1 + 0.5) = 10 · Γ(1.5) = 10 · (√π / 2) ≈ 8.862
        import math
        self.assertAlmostEqual(
            expected_session_length(self.REF),
            10.0 * math.gamma(1.5), places=4,
        )

    def test_mc_within_tolerance(self):
        a = wsl_rtp(self.REF)
        mc = wsl_mc(self.REF, sessions=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestParetoJackpot(unittest.TestCase):
    REF = ParetoJackpotParams(p_hit_per_spin=0.001, alpha=3.0, x_min=1000.0)

    def test_expected_jackpot(self):
        # 3 · 1000 / 2 = 1500
        self.assertAlmostEqual(expected_jackpot(self.REF), 1500.0)

    def test_variance_jackpot_alpha_above_2(self):
        # 3 · 10^6 / (2^2 · 1) = 750000
        self.assertAlmostEqual(variance_jackpot(self.REF), 3 * 1_000_000 / (4 * 1))

    def test_alpha_below_1_infinite_mean(self):
        p = ParetoJackpotParams(p_hit_per_spin=0.001, alpha=0.5, x_min=1000.0)
        import math
        self.assertEqual(expected_jackpot(p), float("inf"))

    def test_prob_exceeds_factor(self):
        # P(X > 2 · x_min) = 2^{-3} = 0.125
        self.assertAlmostEqual(prob_exceeds_factor(self.REF, 2.0), 0.125)


class TestBetaBinomial(unittest.TestCase):
    REF = BetaBinomialParams(n_trials=20, alpha=2.0, beta=8.0, pay_per_success=5.0)

    def test_expected_successes(self):
        # 20 · 2 / 10 = 4
        self.assertAlmostEqual(expected_successes(self.REF), 4.0)

    def test_variance(self):
        # n · a · b · (a + b + n) / ((a+b)^2 · (a+b+1))
        # = 20 · 2 · 8 · 30 / (100 · 11) = 9600 / 1100 ≈ 8.727
        self.assertAlmostEqual(variance_successes(self.REF), 9600 / 1100, places=4)

    def test_overdispersion_ratio_above_1(self):
        # Mixing introduces overdispersion vs pure binomial
        self.assertGreater(overdispersion_ratio(self.REF), 1.0)

    def test_mc_within_tolerance(self):
        a = bbo_rtp(self.REF)
        mc = bbo_mc(self.REF, spins=20_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


class TestPoissonMixture(unittest.TestCase):
    REF = PoissonMixtureParams(
        q_hot=0.20, lambda_base=2.0, lambda_hot=10.0, pay_per_feature=1.0,
    )

    def test_expected_mixture(self):
        # 0.2·10 + 0.8·2 = 2 + 1.6 = 3.6
        self.assertAlmostEqual(pmf_expected(self.REF), 3.6)

    def test_variance_above_pure_poisson(self):
        # Mixture variance includes variance-of-means contribution
        # → strictly more than weighted average of conditional variances
        v = pmf_variance(self.REF)
        e = pmf_expected(self.REF)
        self.assertGreater(v, e)

    def test_mc_within_tolerance(self):
        a = pmf_rtp(self.REF)
        mc = pmf_mc(self.REF, sessions=30_000, seed=42)
        ratio = mc["rtp_mc"] / max(a, 1e-9)
        self.assertGreater(ratio, 0.90)
        self.assertLess(ratio, 1.10)


if __name__ == "__main__":
    unittest.main()
