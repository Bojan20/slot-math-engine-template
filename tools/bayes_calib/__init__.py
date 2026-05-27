"""PHASE 27 — Bayesian Calibration Engine.

Conjugate-prior posterior updates for slot-math parameters from live
RGS telemetry. Two canonical kernels:

  - **Beta-Binomial**: posterior over feature trigger probability p
        prior: Beta(α, β); evidence (k trials, x successes)
        posterior: Beta(α + x, β + k − x)

  - **Normal-Normal**: posterior over per-spin payout mean μ
        prior: Normal(μ₀, σ²₀); evidence n samples, sample-mean x̄, σ² known
        posterior: Normal(μ_n, σ²_n) where
          σ²_n = 1 / (1/σ²₀ + n/σ²)
          μ_n = σ²_n × (μ₀/σ²₀ + n·x̄/σ²)

Each posterior carries 95 %-credible interval (Beta via Wilson score-
style approximation; Normal via z-bounds).

Pure stdlib. No scipy / numpy dep.

Public API:
    from tools.bayes_calib import (
        BetaPosterior, NormalPosterior,
        update_beta_binomial, update_normal_normal,
        credible_interval_beta, credible_interval_normal,
    )
"""

from __future__ import annotations

from tools.bayes_calib.calibrator import (
    BetaPosterior,
    NormalPosterior,
    update_beta_binomial,
    update_normal_normal,
    credible_interval_beta,
    credible_interval_normal,
)

__all__ = [
    "BetaPosterior",
    "NormalPosterior",
    "update_beta_binomial",
    "update_normal_normal",
    "credible_interval_beta",
    "credible_interval_normal",
]
