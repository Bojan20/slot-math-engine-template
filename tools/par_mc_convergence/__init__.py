"""SLOT-MATH Faza 3 — MC convergence sweep gate.

Tier-based Monte Carlo verification that compiled Game IR reproduces
PAR's declared math within Wilson confidence intervals. Blocks deploy
on any drift.

Pipeline:
    game.ir.json + canonical.par.yaml
            │
            ▼
    orchestrator.run_sweep(tier=Tn)
            │
            ▼  (for each seed × tier)
    Rust hot-path MC executor (~25-900 ns/spin, rayon parallel)
            │
            ▼
    Welford aggregate (RTP, hit_freq, variance, max_win, P-quantiles)
            │
            ▼
    compare.measured_vs_par()  →  per-metric delta tabela
            │
            ▼
    wilson.within_ci(metric, tier)
            │
            ▼  (pass) attestation.emit()
            ▼  (fail) diff_report.generate()
"""
from tools.par_mc_convergence.tiers import (
    TIERS,
    Tier,
    TierConfig,
    tier_seeds,
)
from tools.par_mc_convergence.wilson import (
    wilson_ci,
    within_tolerance,
    rtp_tolerance_for_tier,
)
from tools.par_mc_convergence.compare import (
    MeasuredMetrics,
    MetricDelta,
    compare_measured_to_par,
)
from tools.par_mc_convergence.diff_report import (
    generate_diff_report,
    diff_report_to_markdown,
)
from tools.par_mc_convergence.attestation import (
    emit_attestation,
    attestation_merkle_sha256,
)

__all__ = [
    "TIERS",
    "Tier",
    "TierConfig",
    "tier_seeds",
    "wilson_ci",
    "within_tolerance",
    "rtp_tolerance_for_tier",
    "MeasuredMetrics",
    "MetricDelta",
    "compare_measured_to_par",
    "generate_diff_report",
    "diff_report_to_markdown",
    "emit_attestation",
    "attestation_merkle_sha256",
]
