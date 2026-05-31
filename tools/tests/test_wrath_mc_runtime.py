"""SLOT-MATH W244 MC Runtime — Wrath convergence gate.

Asserts that the per-spin MC sampler, when calibrated from Wrath's
closed-form RTP source, converges to the published total RTP within
the 99% Wilson confidence interval at increasing sample sizes.

This is the FIRST per-spin (not just closed-form) real-game gate in
slot-math. Until now MC was synthetic Bernoulli+lognormal that didn't
reflect any real game; the runtime closes that gap.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
WRATH_RTP = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/closed-form-rtp.json"

skip_no_wrath = pytest.mark.skipif(
    not WRATH_RTP.is_file(),
    reason="Wrath PAR library entry missing — import bridge first",
)


@skip_no_wrath
def test_mc_runtime_executor_calibrates_from_wrath_cf():
    """Build executor from Wrath CF, verify trigger probs match published."""
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf

    cf = json.loads(WRATH_RTP.read_text())
    ex = build_wrath_executor_from_cf(cf)

    assert abs(ex.fs_trigger_p - cf["triggers"]["fs"]["p"]) < 1e-12
    assert abs(ex.hnw_trigger_p - cf["triggers"]["hnw"]["p"]) < 1e-12
    assert abs(ex.fs_session_e - cf["fs_session"]["E"]) < 1e-9
    assert abs(ex.hnw_session_e - cf["hnw_session"]["E"]) < 1e-9
    # Base RTP = base_line + scatter_pay_base + lightning_uplift
    c = cf["components"]
    expected_base = c["base_line"] + c["scatter_pay_base"] + c["lightning_uplift"]
    assert abs(ex.base_rtp_per_spin - expected_base) < 1e-12


@skip_no_wrath
def test_mc_runtime_converges_at_1m_spins():
    """1M spins: measured RTP must be within Wilson 99% CI of CF target."""
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf, run_mc

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)
    result = run_mc(executor, spins=1_000_000, seed=42, cf_target_rtp=cf["total_rtp"])

    assert result.convergence_pass, (
        f"MC RTP {result.rtp:.4%} outside Wilson 99% CI of CF target "
        f"{cf['total_rtp']:.4%}. Δ={result.delta_bps:+.2f} bps, "
        f"CI half-width={result.wilson_99_halfwidth:.4%}"
    )
    # Sanity bounds (per-spin payouts are heavy-tailed but bounded by cap)
    assert 0.85 <= result.rtp <= 1.10, f"RTP {result.rtp:.4%} outside sane range"
    assert result.max_win_x <= executor.max_win_cap_x + 1e-6, (
        f"max_win {result.max_win_x} exceeded cap {executor.max_win_cap_x}"
    )


@skip_no_wrath
def test_mc_runtime_trigger_rates_match_published():
    """Trigger frequencies measured ≈ published trigger probabilities."""
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf, run_mc

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)
    # 500K spins — enough for trigger rates to stabilize
    result = run_mc(executor, spins=500_000, seed=99, cf_target_rtp=cf["total_rtp"])

    target_fs_p = cf["triggers"]["fs"]["p"]
    target_hnw_p = cf["triggers"]["hnw"]["p"]
    # 99% Wilson CI on Bernoulli(p, N=500K)
    import math
    fs_halfw = 2.576 * math.sqrt(target_fs_p * (1 - target_fs_p) / 500_000)
    hnw_halfw = 2.576 * math.sqrt(target_hnw_p * (1 - target_hnw_p) / 500_000)
    fs_delta = abs(result.fs_trigger_rate - target_fs_p)
    hnw_delta = abs(result.hnw_trigger_rate - target_hnw_p)
    # Allow 2× Wilson half-width — Gamma sampling adds noise
    assert fs_delta <= 2 * fs_halfw, (
        f"FS trigger rate {result.fs_trigger_rate:.6f} off target "
        f"{target_fs_p:.6f} by {fs_delta:.6f} (>2× Wilson CI {fs_halfw:.6f})"
    )
    assert hnw_delta <= 2 * hnw_halfw, (
        f"H&W trigger rate {result.hnw_trigger_rate:.6f} off target "
        f"{target_hnw_p:.6f} by {hnw_delta:.6f} (>2× Wilson CI {hnw_halfw:.6f})"
    )


@skip_no_wrath
def test_mc_runtime_respects_max_win_cap():
    """No single spin pays more than max_win_cap_x."""
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf, run_mc

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)
    executor.max_win_cap_x = 100.0  # tight cap to force cap engagement
    result = run_mc(executor, spins=200_000, seed=7, cf_target_rtp=cf["total_rtp"])

    assert result.max_win_x <= 100.0 + 1e-9, (
        f"Cap violation: max_win {result.max_win_x} > 100.0"
    )


@skip_no_wrath
def test_mc_runtime_throughput():
    """Pure-Python runtime must do ≥ 500K spins/sec on a modest laptop."""
    import time
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf, run_mc

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)
    spins = 100_000
    t0 = time.perf_counter()
    run_mc(executor, spins=spins, seed=1)
    dt = time.perf_counter() - t0
    rate = spins / dt
    assert rate >= 500_000, (
        f"MC runtime too slow: {rate:,.0f} spins/sec (need ≥ 500K)"
    )


@skip_no_wrath
def test_mc_runtime_deterministic_with_seed():
    """Same seed → identical result."""
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf, run_mc

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)
    r1 = run_mc(executor, spins=50_000, seed=2026)
    r2 = run_mc(executor, spins=50_000, seed=2026)
    assert r1.rtp == r2.rtp
    assert r1.hit_rate == r2.hit_rate
    assert r1.fs_trigger_rate == r2.fs_trigger_rate
    assert r1.max_win_x == r2.max_win_x
