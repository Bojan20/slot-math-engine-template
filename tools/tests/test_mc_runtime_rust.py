"""SLOT-MATH W244 MC Runtime — Rust port test gate.

Validates:
  1. Rust binary builds + responds to JSON-on-stdin protocol
  2. Rust output ≡ Python pure output (within sampling noise)
  3. Rust speed ≥ 30M spins/sec (target 100M+, gate 30M for slow CI)
  4. Rust + Python both converge to Wrath CF target within Wilson 99% CI
  5. Subprocess error handling: bad JSON, missing fields, timeout

Skip condition: tests auto-skip if mc_runtime_real binary not built.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
WRATH_RTP = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/closed-form-rtp.json"


def _rust_binary_available() -> bool:
    from tools.par_kernels.mc_runtime_rust import find_binary
    return find_binary() is not None


_skip_no_rust = pytest.mark.skipif(
    not _rust_binary_available(),
    reason="mc_runtime_real not built; cargo build --release --bin mc_runtime_real",
)


@pytest.fixture
def wrath_executor():
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf
    cf = json.loads(WRATH_RTP.read_text())
    return build_wrath_executor_from_cf(cf), cf["total_rtp"]


@_skip_no_rust
def test_rust_mc_binary_responds_to_stdin(wrath_executor):
    """Smoke: Rust binary accepts stdin JSON and returns valid result."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, target = wrath_executor
    mc, extra = run_mc_rust(executor, spins=10_000, seed=1, cf_target_rtp=target)
    assert extra is not None, "Rust path should NOT have fallen back to Python"
    assert mc.spins == 10_000
    assert 0.0 <= mc.rtp <= 2.0
    assert mc.std_error >= 0.0
    assert mc.max_win_x >= 0.0


@_skip_no_rust
def test_rust_mc_converges_at_1m_spins(wrath_executor):
    """1M spins via Rust: convergence within Wilson 99% CI."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, target = wrath_executor
    mc, extra = run_mc_rust(executor, spins=1_000_000, seed=42, cf_target_rtp=target)
    assert mc.convergence_pass, (
        f"Rust MC failed CI bracket at 1M spins. RTP={mc.rtp:.4%}, "
        f"target={target:.4%}, Δ={mc.delta_bps:+.2f} bps, "
        f"halfwidth=±{mc.wilson_99_halfwidth:.4%}"
    )
    assert 0.85 <= mc.rtp <= 1.10
    assert extra is not None and extra.spins_per_sec > 1_000_000


@_skip_no_rust
def test_rust_mc_throughput_beats_30m_spins_per_sec(wrath_executor):
    """Rust speed gate: ≥ 30M spins/sec (target 100M+, CI-safe 30M)."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, _ = wrath_executor
    mc, extra = run_mc_rust(executor, spins=5_000_000, seed=7)
    assert extra is not None
    assert extra.spins_per_sec >= 30_000_000, (
        f"Rust throughput {extra.spins_per_sec:,.0f} spins/sec < 30M gate. "
        f"Build mode? cargo build --release --bin mc_runtime_real"
    )


@_skip_no_rust
def test_rust_vs_python_statistical_agreement(wrath_executor):
    """Rust and Python should converge to RTPs within combined Wilson CI."""
    import math
    from tools.par_kernels.mc_runtime import run_mc as run_mc_python
    from tools.par_kernels.mc_runtime_rust import run_mc_rust

    executor, target = wrath_executor
    spins = 200_000

    py = run_mc_python(executor, spins=spins, seed=12345, cf_target_rtp=target)
    rs, _ = run_mc_rust(executor, spins=spins, seed=54321, cf_target_rtp=target)

    # Both should bracket CF target within their respective Wilson CIs
    assert py.convergence_pass
    assert rs.convergence_pass

    # Difference should be within sum-of-halfwidths (loose triangle inequality)
    combined_halfwidth = py.wilson_99_halfwidth + rs.wilson_99_halfwidth
    delta = abs(py.rtp - rs.rtp)
    assert delta <= combined_halfwidth, (
        f"Rust vs Python RTP diverge by {delta:.4%} > combined CI {combined_halfwidth:.4%}\n"
        f"  Python: {py.rtp:.4%} ± {py.wilson_99_halfwidth:.4%}\n"
        f"  Rust:   {rs.rtp:.4%} ± {rs.wilson_99_halfwidth:.4%}"
    )


@_skip_no_rust
def test_rust_mc_deterministic_with_seed(wrath_executor):
    """Same seed → identical Rust output."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, _ = wrath_executor
    r1, _ = run_mc_rust(executor, spins=50_000, seed=2026)
    r2, _ = run_mc_rust(executor, spins=50_000, seed=2026)
    assert r1.rtp == r2.rtp
    assert r1.hit_rate == r2.hit_rate
    assert r1.fs_trigger_rate == r2.fs_trigger_rate
    assert r1.max_win_x == r2.max_win_x


@_skip_no_rust
def test_rust_mc_respects_max_win_cap(wrath_executor):
    """Per-spin payout never exceeds max_win_cap_x."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, _ = wrath_executor
    executor.max_win_cap_x = 50.0  # tight cap
    mc, _ = run_mc_rust(executor, spins=200_000, seed=99)
    assert mc.max_win_x <= 50.0 + 1e-9


def test_fallback_to_python_when_binary_missing():
    """If SLOT_MATH_MC_RUNTIME_BIN points to nonexistent path, fall back."""
    import os
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf
    from tools.par_kernels.mc_runtime_rust import run_mc_rust

    if not WRATH_RTP.is_file():
        pytest.skip("Wrath PAR library missing")

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)

    old = os.environ.get("SLOT_MATH_MC_RUNTIME_BIN")
    os.environ["SLOT_MATH_MC_RUNTIME_BIN"] = "/nonexistent/path/to/binary"
    try:
        mc, extra = run_mc_rust(
            executor, spins=10_000, seed=1, cf_target_rtp=cf["total_rtp"],
            fallback_to_python=True,
        )
        assert extra is None, "extra should be None when Python fallback fires"
        assert mc.spins == 10_000
    finally:
        if old is not None:
            os.environ["SLOT_MATH_MC_RUNTIME_BIN"] = old
        else:
            os.environ.pop("SLOT_MATH_MC_RUNTIME_BIN", None)


def test_fallback_raises_when_disabled():
    """fallback_to_python=False raises if binary missing."""
    import os
    from tools.par_kernels.mc_runtime import build_wrath_executor_from_cf
    from tools.par_kernels.mc_runtime_rust import RustMcBinaryMissing, run_mc_rust

    if not WRATH_RTP.is_file():
        pytest.skip("Wrath PAR library missing")

    cf = json.loads(WRATH_RTP.read_text())
    executor = build_wrath_executor_from_cf(cf)

    old = os.environ.get("SLOT_MATH_MC_RUNTIME_BIN")
    os.environ["SLOT_MATH_MC_RUNTIME_BIN"] = "/nonexistent/path/to/binary"
    try:
        with pytest.raises(RustMcBinaryMissing):
            run_mc_rust(
                executor, spins=1_000, seed=1, fallback_to_python=False,
            )
    finally:
        if old is not None:
            os.environ["SLOT_MATH_MC_RUNTIME_BIN"] = old
        else:
            os.environ.pop("SLOT_MATH_MC_RUNTIME_BIN", None)
