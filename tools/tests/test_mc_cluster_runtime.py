"""SLOT-MATH W244 cluster-pays MC runtime — test gate.

Validates the per-spin sampler closes the Mystic Cluster MC gap
documented as "skipped" in test_multi_game_w244.py.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
MYSTIC_IR = REPO / "reports/par-library/mystic-cluster/v1.0.0/game.ir.json"
MYSTIC_CF = REPO / "reports/par-library/mystic-cluster/v1.0.0/closed-form-rtp.json"


_skip_no_mystic = pytest.mark.skipif(
    not MYSTIC_IR.is_file(),
    reason="Mystic Cluster PAR library entry missing",
)


@pytest.fixture
def mystic_executor():
    from tools.par_kernels.mc_cluster_runtime import build_cluster_executor_from_cf
    cf = json.loads(MYSTIC_CF.read_text())
    ir = json.loads(MYSTIC_IR.read_text())
    return build_cluster_executor_from_cf(cf, ir), cf["total_rtp"], cf


@_skip_no_mystic
def test_cluster_mc_builds_from_cf(mystic_executor):
    """Executor is wired from CF + IR with sensible defaults."""
    executor, target, cf = mystic_executor
    # 7 paying symbols × 4 sizes = 28 dist entries
    total_entries = sum(len(d) for d in executor.cluster_distribution.values())
    assert total_entries == 28
    assert executor.min_cluster_size == 5
    assert executor.max_win_cap_x == 10000.0
    # Cascade calibration: cf has cluster_pays_base=0.65, cascade_uplift=0.30
    # Expected p ≈ 0.30/0.65/(0.6×(1+0.30/0.65)) ≈ 0.53
    assert 0.4 <= executor.cascade_continue_p <= 0.65


@_skip_no_mystic
def test_cluster_mc_converges_at_200k_spins(mystic_executor):
    """200K spinova: convergence within Wilson 99% CI."""
    from tools.par_kernels.mc_cluster_runtime import run_mc_cluster
    executor, target, _ = mystic_executor
    result = run_mc_cluster(executor, spins=200_000, seed=42, cf_target_rtp=target)
    assert result.convergence_pass, (
        f"Mystic cluster MC RTP {result.rtp:.4%} outside Wilson 99% CI of "
        f"CF target {target:.4%}. Δ={result.delta_bps:+.2f} bps, "
        f"halfwidth=±{result.wilson_99_halfwidth:.4%}"
    )
    # Sanity bounds
    assert 0.70 <= result.rtp <= 1.20, f"RTP {result.rtp:.4%} outside sane range"


@_skip_no_mystic
def test_cluster_mc_respects_max_cap(mystic_executor):
    """Per-spin payout never exceeds max_win_cap_x."""
    from tools.par_kernels.mc_cluster_runtime import run_mc_cluster
    executor, _, _ = mystic_executor
    executor.max_win_cap_x = 50.0  # tight cap
    result = run_mc_cluster(executor, spins=200_000, seed=7)
    assert result.max_win_x <= 50.0 + 1e-9


@_skip_no_mystic
def test_cluster_mc_deterministic(mystic_executor):
    """Same seed → identical result."""
    from tools.par_kernels.mc_cluster_runtime import run_mc_cluster
    executor, _, _ = mystic_executor
    r1 = run_mc_cluster(executor, spins=50_000, seed=2026)
    r2 = run_mc_cluster(executor, spins=50_000, seed=2026)
    assert r1.rtp == r2.rtp
    assert r1.hit_rate == r2.hit_rate
    assert r1.cascade_rate == r2.cascade_rate
    assert r1.max_win_x == r2.max_win_x


@_skip_no_mystic
def test_cluster_mc_cascade_active(mystic_executor):
    """Cascade fires on paying spinova (cascade_rate ≤ hit_rate)."""
    from tools.par_kernels.mc_cluster_runtime import run_mc_cluster
    executor, _, _ = mystic_executor
    result = run_mc_cluster(executor, spins=100_000, seed=99)
    assert result.cascade_rate > 0, "Cascade should fire ~half of paying spins"
    assert result.cascade_rate <= result.hit_rate, (
        f"cascade_rate {result.cascade_rate:.4f} > hit_rate {result.hit_rate:.4f} "
        f"— cascade only fires on paying spins"
    )


def test_calibrate_cascade_continue_p_inverse_formula():
    """calibrate_cascade_continue_p is mathematically correct."""
    from tools.par_kernels.mc_cluster_runtime import calibrate_cascade_continue_p
    # Sanity: cf_cluster_base=0.65, cf_cascade_uplift=0.30
    # R = 0.30/0.65 = 0.4615
    # p = R / (0.6 × (1 + R)) = 0.4615 / (0.6 × 1.4615) = 0.526
    p = calibrate_cascade_continue_p(
        cluster_distribution={"X": {5: 1.0}},
        pay_table={"X": {5: 1.0}},
        cf_cluster_base=0.65,
        cf_cascade_uplift=0.30,
    )
    assert abs(p - 0.5263) < 0.01

    # Zero cascade → p = 0
    p_zero = calibrate_cascade_continue_p(
        cluster_distribution={},
        pay_table={},
        cf_cluster_base=0.65,
        cf_cascade_uplift=0.0,
    )
    assert p_zero == 0.0

    # Clamp: very high cascade → p capped at 0.95
    p_clamp = calibrate_cascade_continue_p(
        cluster_distribution={},
        pay_table={},
        cf_cluster_base=0.1,
        cf_cascade_uplift=10.0,
    )
    assert p_clamp <= 0.95
