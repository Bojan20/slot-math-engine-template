"""PHASE 27 — Conjugate-prior posterior update kernels."""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class BetaPosterior:
    alpha: float
    beta: float

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def variance(self) -> float:
        a, b = self.alpha, self.beta
        return (a * b) / ((a + b) ** 2 * (a + b + 1))

    @property
    def mode(self) -> float | None:
        if self.alpha > 1 and self.beta > 1:
            return (self.alpha - 1) / (self.alpha + self.beta - 2)
        return None


@dataclass(frozen=True)
class NormalPosterior:
    mu: float
    sigma_sq: float

    @property
    def std_dev(self) -> float:
        return math.sqrt(self.sigma_sq)


def update_beta_binomial(
    prior: BetaPosterior, trials: int, successes: int,
) -> BetaPosterior:
    """Beta posterior given Binomial evidence."""
    if trials < 0:
        raise ValueError("trials must be ≥ 0")
    if successes < 0 or successes > trials:
        raise ValueError("require 0 ≤ successes ≤ trials")
    if prior.alpha <= 0 or prior.beta <= 0:
        raise ValueError("prior alpha, beta must be > 0")
    return BetaPosterior(
        alpha=prior.alpha + successes,
        beta=prior.beta + (trials - successes),
    )


def update_normal_normal(
    prior: NormalPosterior,
    sample_mean: float,
    n: int,
    observation_variance: float,
) -> NormalPosterior:
    """Normal posterior given known-variance Normal evidence."""
    if n < 1:
        raise ValueError("n must be ≥ 1")
    if observation_variance <= 0:
        raise ValueError("observation_variance must be > 0")
    if prior.sigma_sq <= 0:
        raise ValueError("prior.sigma_sq must be > 0")
    inv_post = 1.0 / prior.sigma_sq + n / observation_variance
    sigma_sq_n = 1.0 / inv_post
    mu_n = sigma_sq_n * (
        prior.mu / prior.sigma_sq + n * sample_mean / observation_variance
    )
    return NormalPosterior(mu=mu_n, sigma_sq=sigma_sq_n)


def credible_interval_beta(
    post: BetaPosterior, level: float = 0.95,
) -> tuple[float, float]:
    """Wilson-score-style ±z·SE approximation for Beta credible interval.

    For α, β ≥ 5 the Beta is well-approximated by Normal(mean, var).
    For smaller shape params, returns a clipped Normal CI as a
    conservative proxy.
    """
    if not 0 < level < 1:
        raise ValueError("level must be in (0, 1)")
    z = _inverse_normal_cdf((1 + level) / 2)
    mean = post.mean
    se = math.sqrt(post.variance)
    lo = max(0.0, mean - z * se)
    hi = min(1.0, mean + z * se)
    return lo, hi


def credible_interval_normal(
    post: NormalPosterior, level: float = 0.95,
) -> tuple[float, float]:
    if not 0 < level < 1:
        raise ValueError("level must be in (0, 1)")
    z = _inverse_normal_cdf((1 + level) / 2)
    return post.mu - z * post.std_dev, post.mu + z * post.std_dev


def _inverse_normal_cdf(p: float) -> float:
    """Beasley-Springer-Moro inverse Φ approximation.

    Accurate to ~1e-7 across (0, 1).
    """
    if not 0 < p < 1:
        raise ValueError("p must be in (0, 1)")
    # Coefficients from Beasley-Springer 1977
    a = [
        -3.969683028665376e+01,  2.209460984245205e+02,
        -2.759285104469687e+02,  1.383577518672690e+02,
        -3.066479806614716e+01,  2.506628277459239e+00,
    ]
    b = [
        -5.447609879822406e+01,  1.615858368580409e+02,
        -1.556989798598866e+02,  6.680131188771972e+01,
        -1.328068155288572e+01,
    ]
    c = [
        -7.784894002430293e-03, -3.223964580411365e-01,
        -2.400758277161838e+00, -2.549732539343734e+00,
         4.374664141464968e+00,  2.938163982698783e+00,
    ]
    d = [
         7.784695709041462e-03,  3.224671290700398e-01,
         2.445134137142996e+00,  3.754408661907416e+00,
    ]
    plow = 0.02425
    phigh = 1 - plow
    if p < plow:
        q = math.sqrt(-2 * math.log(p))
        return (((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / \
                ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
    if p > phigh:
        q = math.sqrt(-2 * math.log(1 - p))
        return -(((((c[0]*q + c[1])*q + c[2])*q + c[3])*q + c[4])*q + c[5]) / \
                 ((((d[0]*q + d[1])*q + d[2])*q + d[3])*q + 1)
    q = p - 0.5
    r = q * q
    return (((((a[0]*r + a[1])*r + a[2])*r + a[3])*r + a[4])*r + a[5]) * q / \
            (((((b[0]*r + b[1])*r + b[2])*r + b[3])*r + b[4])*r + 1)
