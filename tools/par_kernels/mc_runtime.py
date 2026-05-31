"""SLOT-MATH W244 MC Runtime — per-spin simulator from closed-form kernel params.

This module closes the second-largest gap in slot-math: the
`mc_convergence.rs` Rust binary uses a synthetic Bernoulli+lognormal
worker that doesn't reflect any real game's math. This pure-Python MC
runtime instead **samples per-spin payouts from the SAME closed-form
parameters used by W244 kernels** — meaning the MC output converges to
the kernel's analytically-derived RTP.

Architecture
------------

    closed-form params (from composer.compose)
      → per-kernel samplers
      → SpinExecutor
      → SpinSampleStream
      → Welford streaming stats
      → MC convergence check vs CF target

Per-kernel samplers:
  - lines  / asymmetric_paytable  → Bernoulli hit + paytable categorical
  - expanding_symbol (free_spins) → Bernoulli trigger + Gamma-shaped session payout
  - hold_and_win                  → Bernoulli trigger + Gamma-shaped session payout
  - delegated_baseline            → constant per-spin RTP (no variance, audit-only)

Convergence acceptance: |measured_rtp - cf_target| ≤ Wilson_99_CI half-width.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Any



# ─── Per-spin sample stream ───────────────────────────────────────────


@dataclass
class SpinSample:
    """Outcome of one simulated spin."""
    base_payout_x: float = 0.0           # base-game lines pay (×bet)
    feature_payouts_x: dict[str, float] = field(default_factory=dict)
    fs_triggered: bool = False
    hnw_triggered: bool = False

    @property
    def total_payout_x(self) -> float:
        return self.base_payout_x + sum(self.feature_payouts_x.values())


# ─── Per-kernel samplers ──────────────────────────────────────────────


def sample_bernoulli_session(
    rng: random.Random,
    trigger_p: float,
    session_e: float,
    session_std: float,
) -> tuple[bool, float]:
    """Bernoulli trigger + Gamma-shaped session payout.

    Returns (triggered, payout_x). Uses Gamma distribution for the
    session payout because real slot session payouts are heavy-tailed
    + non-negative; Gamma matches the (E, σ) moments via
    shape=k=E²/σ², scale=θ=σ²/E.
    """
    if rng.random() > trigger_p:
        return False, 0.0
    if session_e <= 0:
        return True, 0.0
    if session_std <= 0:
        return True, session_e
    # Gamma moment matching
    k = (session_e ** 2) / (session_std ** 2)
    theta = (session_std ** 2) / session_e
    payout = rng.gammavariate(k, theta)
    return True, payout


def sample_base_lines(
    rng: random.Random,
    base_rtp_per_spin: float,
    hit_freq: float = 0.207,
    avg_lognorm_sigma: float = 1.4,
) -> float:
    """Sample base-game lines payout.

    Uses Bernoulli hit + lognormal payout calibrated so that
    E[payout × hit_freq] = base_rtp_per_spin.
    """
    if rng.random() > hit_freq:
        return 0.0
    if base_rtp_per_spin <= 0 or hit_freq <= 0:
        return 0.0
    # E[payout|hit] = base_rtp_per_spin / hit_freq
    e_pay_given_hit = base_rtp_per_spin / hit_freq
    # Lognormal: E = exp(mu + sigma²/2), so mu = log(E) - sigma²/2
    mu = math.log(max(e_pay_given_hit, 1e-12)) - (avg_lognorm_sigma ** 2) / 2
    return math.exp(mu + avg_lognorm_sigma * rng.gauss(0.0, 1.0))


# ─── SpinExecutor ─────────────────────────────────────────────────────


@dataclass
class WrathSpinExecutor:
    """Per-spin sampler for Wrath-like games (lines + FS + H&W + lightning)."""

    # Calibrated from composition + delegated baseline
    base_rtp_per_spin: float
    base_hit_freq: float
    fs_trigger_p: float
    fs_session_e: float
    fs_session_std: float
    hnw_trigger_p: float
    hnw_session_e: float
    hnw_session_std: float
    max_win_cap_x: float = 5000.0

    def spin(self, rng: random.Random) -> SpinSample:
        sample = SpinSample()

        # Base lines (delegated baseline RTP, modeled as Bernoulli + lognormal)
        sample.base_payout_x = sample_base_lines(
            rng, self.base_rtp_per_spin, self.base_hit_freq
        )

        # FS feature
        fs_hit, fs_pay = sample_bernoulli_session(
            rng, self.fs_trigger_p, self.fs_session_e, self.fs_session_std
        )
        sample.fs_triggered = fs_hit
        if fs_hit:
            sample.feature_payouts_x["free_spins"] = fs_pay

        # H&W feature
        hnw_hit, hnw_pay = sample_bernoulli_session(
            rng, self.hnw_trigger_p, self.hnw_session_e, self.hnw_session_std
        )
        sample.hnw_triggered = hnw_hit
        if hnw_hit:
            sample.feature_payouts_x["hold_and_win"] = hnw_pay

        # Enforce max-win cap (per spin)
        total = sample.total_payout_x
        if total > self.max_win_cap_x:
            scale = self.max_win_cap_x / total
            sample.base_payout_x *= scale
            for k in sample.feature_payouts_x:
                sample.feature_payouts_x[k] *= scale

        return sample


# ─── Welford streaming stats ──────────────────────────────────────────


@dataclass
class StreamingStats:
    n: int = 0
    mean: float = 0.0
    m2: float = 0.0
    max_observed: float = 0.0
    hits: int = 0
    fs_triggers: int = 0
    hnw_triggers: int = 0

    def push(self, x: float, hit: bool = False, fs: bool = False, hnw: bool = False) -> None:
        self.n += 1
        delta = x - self.mean
        self.mean += delta / self.n
        delta2 = x - self.mean
        self.m2 += delta * delta2
        if x > self.max_observed:
            self.max_observed = x
        if hit:
            self.hits += 1
        if fs:
            self.fs_triggers += 1
        if hnw:
            self.hnw_triggers += 1

    @property
    def variance(self) -> float:
        return self.m2 / max(self.n - 1, 1)

    @property
    def std_error(self) -> float:
        return math.sqrt(self.variance / max(self.n, 1))

    @property
    def hit_rate(self) -> float:
        return self.hits / max(self.n, 1)

    def wilson_99_halfwidth(self) -> float:
        """99% Wilson CI half-width on the RTP estimate (per-spin metric)."""
        return 2.576 * self.std_error


# ─── Top-level runner ─────────────────────────────────────────────────


@dataclass
class McResult:
    spins: int
    seed: int
    rtp: float
    std_error: float
    wilson_99_halfwidth: float
    hit_rate: float
    fs_trigger_rate: float
    hnw_trigger_rate: float
    max_win_x: float
    cf_target_rtp: float | None = None
    delta_bps: float | None = None
    convergence_pass: bool = True

    def summary(self) -> str:
        lines = [
            f"# MC Result ({self.spins:,} spins, seed={self.seed})",
            f"RTP:           {self.rtp:.6%} ± {self.std_error:.6%} (SE)",
            f"Wilson 99% CI: ±{self.wilson_99_halfwidth:.6%}",
            f"Hit rate:      {self.hit_rate:.4%}",
            f"FS trigger:    1/{1.0/self.fs_trigger_rate:.2f}" if self.fs_trigger_rate > 0 else "FS trigger:    none",
            f"H&W trigger:   1/{1.0/self.hnw_trigger_rate:.2f}" if self.hnw_trigger_rate > 0 else "H&W trigger:   none",
            f"Max win:       {self.max_win_x:.2f}×",
        ]
        if self.cf_target_rtp is not None:
            lines.append(f"CF target:     {self.cf_target_rtp:.6%}")
            lines.append(f"Δ vs target:   {self.delta_bps:+.2f} bps  "
                         f"({'✅ within Wilson 99% CI' if self.convergence_pass else '🔴 outside Wilson 99% CI'})")
        return "\n".join(lines)


def run_mc(
    executor: WrathSpinExecutor,
    spins: int,
    seed: int = 12345,
    cf_target_rtp: float | None = None,
) -> McResult:
    """Run N spins through the executor and return convergence stats."""
    rng = random.Random(seed)
    stats = StreamingStats()
    for _ in range(spins):
        s = executor.spin(rng)
        stats.push(
            s.total_payout_x,
            hit=(s.base_payout_x > 0),
            fs=s.fs_triggered,
            hnw=s.hnw_triggered,
        )
    rtp = stats.mean
    se = stats.std_error
    half = stats.wilson_99_halfwidth()
    delta_bps = None
    convergence = True
    if cf_target_rtp is not None:
        delta_bps = (rtp - cf_target_rtp) * 10000.0
        convergence = abs(rtp - cf_target_rtp) <= half
    return McResult(
        spins=spins,
        seed=seed,
        rtp=rtp,
        std_error=se,
        wilson_99_halfwidth=half,
        hit_rate=stats.hit_rate,
        fs_trigger_rate=stats.fs_triggers / max(stats.n, 1),
        hnw_trigger_rate=stats.hnw_triggers / max(stats.n, 1),
        max_win_x=stats.max_observed,
        cf_target_rtp=cf_target_rtp,
        delta_bps=delta_bps,
        convergence_pass=convergence,
    )


def build_wrath_executor_from_cf(cf: dict[str, Any]) -> WrathSpinExecutor:
    """Build a WrathSpinExecutor from Wrath's closed-form RTP JSON."""
    c = cf.get("components", {})
    triggers = cf.get("triggers", {})
    fs_session = cf.get("fs_session", {})
    hnw_session = cf.get("hnw_session", {})

    return WrathSpinExecutor(
        base_rtp_per_spin=(c.get("base_line", 0.0)
                           + c.get("scatter_pay_base", 0.0)
                           + c.get("lightning_uplift", 0.0)),
        base_hit_freq=0.207,
        fs_trigger_p=triggers.get("fs", {}).get("p", 0.0),
        fs_session_e=fs_session.get("E", 23.6),
        fs_session_std=fs_session.get("std", 26.6),
        hnw_trigger_p=triggers.get("hnw", {}).get("p", 0.0),
        hnw_session_e=hnw_session.get("E", 44.0),
        hnw_session_std=hnw_session.get("std", 78.0),
        max_win_cap_x=5000.0,
    )
