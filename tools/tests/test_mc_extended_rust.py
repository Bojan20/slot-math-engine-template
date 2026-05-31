"""SLOT-MATH Rust MC extended shapes — cluster/ways/crash test gate.

Validates Rust port of cluster/ways/crash MC executors via the
`mc_extended_real` binary. Speed gates target ~100× pure-Python.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
MYSTIC_DIR = REPO / "reports/par-library/mystic-cluster/v1.0.0"
LIGHTNING_DIR = REPO / "reports/par-library/lightning-ways/v1.0.0"
STAKE_DIR = REPO / "reports/par-library/stake-rush/v1.0.0"


def _binary_available() -> bool:
    from tools.par_kernels.mc_extended_rust import find_extended_binary
    return find_extended_binary() is not None


_skip_no_rust = pytest.mark.skipif(
    not _binary_available(),
    reason="mc_extended_real not built; cargo build --release --bin mc_extended_real",
)


@_skip_no_rust
def test_cluster_rust_converges():
    """Mystic cluster 10M rounds via Rust → Wilson 99% CI of CF target."""
    from tools.par_kernels.mc_extended_rust import run_cluster_rust
    ir = json.loads((MYSTIC_DIR / "game.ir.json").read_text())
    cf = json.loads((MYSTIC_DIR / "closed-form-rtp.json").read_text())
    target = cf["total_rtp"]
    r = run_cluster_rust(cf, ir, n_rounds=10_000_000, seed=42, cf_target_rtp=target)
    assert r.convergence_pass, (
        f"cluster Rust MC RTP {r.rtp:.4%} outside Wilson 99% CI of "
        f"{target:.4%}. Δ={r.delta_bps:+.2f} bps, halfwidth=±{r.wilson_99_halfwidth:.4%}"
    )
    assert r.rounds_per_sec >= 10_000_000, f"cluster rate {r.rounds_per_sec:,.0f}/s < 10M"


@_skip_no_rust
def test_ways_rust_converges():
    """Lightning Ways 10M rounds via Rust → CI convergence."""
    from tools.par_kernels.mc_extended_rust import run_ways_rust
    ir = json.loads((LIGHTNING_DIR / "game.ir.json").read_text())
    cf = json.loads((LIGHTNING_DIR / "closed-form-rtp.json").read_text())
    target = cf["total_rtp"]
    r = run_ways_rust(cf, ir, n_rounds=10_000_000, seed=42, cf_target_rtp=target)
    assert r.convergence_pass, (
        f"ways Rust MC RTP {r.rtp:.4%} outside CI of {target:.4%}. "
        f"Δ={r.delta_bps:+.2f} bps"
    )
    assert r.rounds_per_sec >= 20_000_000, f"ways rate {r.rounds_per_sec:,.0f}/s < 20M"


@_skip_no_rust
def test_crash_rust_converges():
    """Stake Rush 10M rounds via Rust → CI convergence."""
    from tools.par_kernels.mc_extended_rust import run_crash_rust
    ir = json.loads((STAKE_DIR / "game.ir.json").read_text())
    cf = json.loads((STAKE_DIR / "closed-form-rtp.json").read_text())
    target = cf["total_rtp"]
    r = run_crash_rust(cf, ir, n_rounds=10_000_000, seed=42, cf_target_rtp=target)
    assert r.convergence_pass, (
        f"crash Rust MC RTP {r.rtp:.4%} outside CI of {target:.4%}. "
        f"Δ={r.delta_bps:+.2f} bps"
    )
    # Crash is fastest shape (single uniform per round) — gate at 200M
    assert r.rounds_per_sec >= 200_000_000, (
        f"crash rate {r.rounds_per_sec:,.0f}/s < 200M (target 1B+)"
    )


@_skip_no_rust
def test_extended_rust_shapes_deterministic():
    """Same seed → identical Rust output across shapes."""
    from tools.par_kernels.mc_extended_rust import (
        run_cluster_rust, run_ways_rust, run_crash_rust,
    )
    for builder, dirname in [
        (run_cluster_rust, MYSTIC_DIR),
        (run_ways_rust, LIGHTNING_DIR),
        (run_crash_rust, STAKE_DIR),
    ]:
        ir = json.loads((dirname / "game.ir.json").read_text())
        cf = json.loads((dirname / "closed-form-rtp.json").read_text())
        r1 = builder(cf, ir, n_rounds=100_000, seed=2026)
        r2 = builder(cf, ir, n_rounds=100_000, seed=2026)
        assert r1.rtp == r2.rtp, f"non-deterministic for {dirname.name}"
        assert r1.hit_rate == r2.hit_rate


@_skip_no_rust
def test_crash_rust_rtp_invariance_of_T():
    """Provably fair: same RTP for any cashout T ≥ 1 (Rust verification)."""
    from tools.par_kernels.mc_extended_rust import run_crash_rust
    cf = {"house_edge": 0.01, "cashout_multiplier": None}
    ir = {"bet": {"max_win_x": 1_000_000.0}}
    for T in (1.5, 5.0, 50.0):
        cf["cashout_multiplier"] = T
        r = run_crash_rust(cf, ir, n_rounds=2_000_000, seed=42, cf_target_rtp=0.99)
        assert r.convergence_pass, (
            f"T={T} RTP {r.rtp:.4%} outside CI of 99%. Δ={r.delta_bps:+.2f}bps, "
            f"half=±{r.wilson_99_halfwidth:.4%}"
        )
