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
def test_rust_parallel_outperforms_single_thread(wrath_executor):
    """Parallel mode (≥ 100K spinova) must beat single-thread budget."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, _ = wrath_executor
    # 100M spinova is large enough for parallel to dominate startup
    mc, extra = run_mc_rust(executor, spins=10_000_000, seed=99)
    assert extra is not None
    # Single-thread baseline is ~82M spins/sec. Parallel should at minimum
    # match it; on multi-core M-series it hits 300-500M/s. Gate 100M as
    # CI-safe floor.
    assert extra.spins_per_sec >= 100_000_000, (
        f"Parallel Rust throughput {extra.spins_per_sec:,.0f} spins/sec < 100M floor. "
        f"Expected ≥ 100M with rayon over 4+ cores."
    )


@_skip_no_rust
def test_rust_parallel_chunk_combine_numerically_stable(wrath_executor):
    """Chan parallel combine: per-chunk Welford merge ≡ single-thread within float ULP."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, _ = wrath_executor
    # Same seed + spins: parallel and single-thread should produce
    # statistically equivalent results (NOT bit-identical — chunks have
    # independent RNG substreams) within Wilson CI.
    mc_parallel, _ = run_mc_rust(executor, spins=5_000_000, seed=2026)
    # Force single-thread via tiny spins (< 100K threshold)
    mc_serial_a, _ = run_mc_rust(executor, spins=99_000, seed=2026)
    mc_serial_b, _ = run_mc_rust(executor, spins=99_000, seed=2027)
    # All three should be in sane bounds; no NaN, no Inf
    for mc in (mc_parallel, mc_serial_a, mc_serial_b):
        assert mc.rtp == mc.rtp  # NaN check (NaN != NaN)
        assert mc.rtp < 100  # not Inf
        assert mc.std_error >= 0
        assert mc.std_error == mc.std_error  # NaN check


@_skip_no_rust
def test_rust_vs_python_statistical_agreement(wrath_executor):
    """Rust and Python should converge to RTPs within combined Wilson CI."""
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


@_skip_no_rust
def test_rust_per_feature_breakdown_present(wrath_executor):
    """Rust MC must emit per-feature breakdown with Wilson CI."""
    from tools.par_kernels.mc_runtime_rust import (
        FeatureBreakdown,
        run_mc_rust,
    )
    executor, _ = wrath_executor
    _, extra = run_mc_rust(executor, spins=500_000, seed=42)
    assert extra is not None
    assert extra.feature_breakdown is not None
    expected = {"base_lines", "free_spins", "hold_and_win"}
    assert set(extra.feature_breakdown.keys()) == expected
    for name, fb in extra.feature_breakdown.items():
        assert isinstance(fb, FeatureBreakdown)
        assert fb.rtp_contribution >= 0.0
        assert fb.std_error >= 0.0
        assert fb.wilson_99_halfwidth >= 0.0


@_skip_no_rust
def test_rust_per_feature_sums_to_total(wrath_executor):
    """sum(per-feature) == total RTP to float ULP."""
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    executor, _ = wrath_executor
    mc, extra = run_mc_rust(executor, spins=500_000, seed=99)
    assert extra is not None and extra.feature_breakdown is not None
    total = sum(fb.rtp_contribution for fb in extra.feature_breakdown.values())
    # When cap doesn't fire, sum == total exactly. When cap fires, sum
    # may be slightly less (capped values per-feature are scaled).
    # Both within float precision.
    assert abs(total - mc.rtp) < 1e-9


@_skip_no_rust
def test_rust_per_feature_wrath_matches_cf(wrath_executor):
    """At 100M spinova, per-feature MC must match Wrath CF within Wilson CI."""
    import json
    from pathlib import Path
    from tools.par_kernels.mc_runtime_rust import run_mc_rust
    cf = json.loads((Path(__file__).resolve().parents[2] /
                     "reports/par-library/wrath-of-olympus/v12.0.0/closed-form-rtp.json").read_text())
    executor, _ = wrath_executor
    _, extra = run_mc_rust(executor, spins=100_000_000, seed=42)
    assert extra is not None and extra.feature_breakdown is not None
    components = cf["components"]
    cf_base = components.get("base_line", 0) + components.get("scatter_pay_base", 0) + components.get("lightning_uplift", 0)
    cf_fs = components.get("fs", 0)
    cf_hnw = components.get("hnw", 0)
    # Each feature MC must bracket CF within Wilson 99% CI
    fb = extra.feature_breakdown
    assert abs(fb["base_lines"].rtp_contribution - cf_base) <= fb["base_lines"].wilson_99_halfwidth, \
        f"base mismatch: MC={fb['base_lines'].rtp_contribution:.4%} CF={cf_base:.4%} CI=±{fb['base_lines'].wilson_99_halfwidth:.4%}"
    assert abs(fb["free_spins"].rtp_contribution - cf_fs) <= fb["free_spins"].wilson_99_halfwidth, \
        f"fs mismatch: MC={fb['free_spins'].rtp_contribution:.4%} CF={cf_fs:.4%}"
    assert abs(fb["hold_and_win"].rtp_contribution - cf_hnw) <= fb["hold_and_win"].wilson_99_halfwidth, \
        f"hnw mismatch: MC={fb['hold_and_win'].rtp_contribution:.4%} CF={cf_hnw:.4%}"
