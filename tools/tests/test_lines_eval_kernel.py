"""SLOT-MATH lines_eval kernel — exact-enumeration per-line evaluator gate.

Closes the "delegated baseline" transparent gap by computing base_line
RTP from first principles (reel weights + paytable + paylines + wild
substitution).

Wrath of Olympus published base_line RTP = 27.8188%. Our exact
enumeration over 14⁵ × 10 paylines (with industry-standard left-to-right
longest-pay rule, wild substitution, wild dominance via max(pay_s_k,
pay_W_k)) returns 27.7303% — Δ -8.85 bps.

The residual ~9 bps reflects the difference between:
  - Wrath's bespoke per-reel-strip enumeration (correlations between
    payline rows because the same physical strip provides 3 visible
    rows per reel)
  - Our weighted-RNG model (independent sampling per row)

For a generic engine this 9 bps gap is the right trade — we trade exact
strip-correlation for generic IR ingestion. The gap is documented as
expected behavior; tolerance is 50 bps (5×expected).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
WRATH_IR = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/game.ir.json"
WRATH_RTP = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/closed-form-rtp.json"


def test_lines_eval_smoke_synthetic():
    """Tiny synthetic game: 2 reels × 1 symbol → exact RTP must equal paytable[3]."""
    from tools.par_kernels.lines_eval import LinesEvalParams, lines_eval_rtp
    # 3-reel game, single symbol "X" only, weight 1 each → P(XXX) = 1
    # Paytable: 3-OAK = 5.0
    p = LinesEvalParams(
        reel_weights=[{"X": 1}, {"X": 1}, {"X": 1}],
        paytable={"X": {3: 5.0}},
        num_paylines=1,
        wild_symbol="W",  # no wilds present
        non_line_symbols=(),
    )
    r = lines_eval_rtp(p)
    assert abs(r["rtp_contribution"] - 5.0) < 1e-12
    assert r["per_symbol_contribution"]["X"] == pytest.approx(5.0)


def test_lines_eval_wild_dominance():
    """W,W,X → pays as W (W payout > X payout)."""
    from tools.par_kernels.lines_eval import LinesEvalParams, lines_eval_rtp
    # 3-reel: W has weight 1 on reel 0+1, X has weight 1 on reel 2.
    # No other symbols. Paytable W:{3:10}, X:{3:5}.
    # Only outcome: W,W,X → chain considers X (with W subs) = 3-OAK X = 5
    # or W (pure-W rule = only W in first k reels). Since reel 2 is X,
    # pure-W chain length is 2 → no W 2-OAK pay. So payout = 5.
    p = LinesEvalParams(
        reel_weights=[{"W": 1}, {"W": 1}, {"X": 1}],
        paytable={"W": {3: 10.0}, "X": {3: 5.0}},
        num_paylines=1,
        wild_symbol="W",
        non_line_symbols=(),
    )
    r = lines_eval_rtp(p)
    # Outcome (W,W,X) has P=1, chain for X = 3 reels (W subs), pay X[3]=5.
    # Pure-W chain length = 2 < 3, no W pay.
    # max(X 3-OAK=5, W) — W not eligible at length 3 because reel 2 != W.
    assert r["rtp_contribution"] == pytest.approx(5.0)


def test_lines_eval_wild_chain_pays_wild():
    """W,W,W → pays as W 3-OAK (pure-wild chain)."""
    from tools.par_kernels.lines_eval import LinesEvalParams, lines_eval_rtp
    p = LinesEvalParams(
        reel_weights=[{"W": 1}, {"W": 1}, {"W": 1}],
        paytable={"W": {3: 10.0}, "X": {3: 5.0}},
        num_paylines=1,
        wild_symbol="W",
        non_line_symbols=(),
    )
    r = lines_eval_rtp(p)
    # All-W combo: best payout = W 3-OAK = 10 (X 3-OAK also valid since
    # W subs, but X pays 5 < 10).
    assert r["rtp_contribution"] == pytest.approx(10.0)


def test_lines_eval_chain_breaks_correctly():
    """X,X,Y → no 3-OAK because chain breaks at Y. RTP = 0."""
    from tools.par_kernels.lines_eval import LinesEvalParams, lines_eval_rtp
    p = LinesEvalParams(
        reel_weights=[{"X": 1}, {"X": 1}, {"Y": 1}],
        paytable={"X": {3: 5.0}, "Y": {3: 3.0}},
        num_paylines=1,
        wild_symbol="W",
        non_line_symbols=(),
    )
    r = lines_eval_rtp(p)
    assert r["rtp_contribution"] == pytest.approx(0.0)


def test_lines_eval_ignores_scatter():
    """Scatter symbol in reels contributes 0 to line pays."""
    from tools.par_kernels.lines_eval import LinesEvalParams, lines_eval_rtp
    p = LinesEvalParams(
        reel_weights=[{"X": 1, "S": 1}, {"X": 1, "S": 1}, {"X": 1, "S": 1}],
        paytable={"X": {3: 5.0}},
        num_paylines=1,
        wild_symbol="W",
        non_line_symbols=("S",),
    )
    r = lines_eval_rtp(p)
    # P(XXX) = 1/8 → RTP = (1/8) × 5 = 0.625
    assert r["rtp_contribution"] == pytest.approx(0.625, abs=1e-9)


@pytest.mark.skipif(not WRATH_IR.is_file(), reason="Wrath not in PAR library")
def test_lines_eval_wrath_exact_parity():
    """Wrath base_line via scatter-aware enumeration ≡ published to ≤ 0.5 bps."""
    from tools.par_kernels.lines_eval import (
        build_lines_params_from_ir, lines_eval_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())

    params = build_lines_params_from_ir(ir)
    assert params is not None
    assert params.scatter_prevention is not None
    assert params.scatter_prevention.enabled
    result = lines_eval_rtp(params)

    target = cf["components"]["base_line"]
    delta_bps = (result["rtp_contribution"] - target) * 10000.0
    # With scatter-aware joint-distribution evaluation, gap closes from
    # 9 bps (uniform) to ≤ 0.5 bps (essentially float-stable parity).
    assert abs(delta_bps) <= 0.5, (
        f"Wrath base_line delta {delta_bps:+.4f} bps > 0.5 bps tolerance. "
        f"Computed {result['rtp_contribution']:.6%}, target {target:.6%}"
    )


@pytest.mark.skipif(not WRATH_IR.is_file(), reason="Wrath not in PAR library")
def test_lines_eval_wrath_performance():
    """14⁵ × 10 paylines × scatter-aware joint distribution < 10s.

    Scatter-aware mode is ~10× slower than uniform mode but delivers
    exact parity with Wrath's published base_line (vs 9 bps gap in
    uniform mode). Trade-off is documented.
    """
    import time
    from tools.par_kernels.lines_eval import (
        build_lines_params_from_ir, lines_eval_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    params = build_lines_params_from_ir(ir)
    t0 = time.perf_counter()
    lines_eval_rtp(params)
    dt = time.perf_counter() - t0
    assert dt < 10.0, f"Lines enum took {dt:.3f}s (>10s budget)"


@pytest.mark.skipif(not WRATH_IR.is_file(), reason="Wrath not in PAR library")
def test_lines_eval_per_symbol_decomposition_consistent():
    """Per-symbol RTPs must sum to total RTP exactly."""
    from tools.par_kernels.lines_eval import (
        build_lines_params_from_ir, lines_eval_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    params = build_lines_params_from_ir(ir)
    result = lines_eval_rtp(params)
    total = result["rtp_contribution"]
    per_sym_sum = sum(result["per_symbol_contribution"].values())
    assert abs(total - per_sym_sum) < 1e-12, (
        f"Per-symbol sum {per_sym_sum} != total {total} (drift {abs(total-per_sym_sum):.2e})"
    )


def test_lines_eval_full_pipeline_via_generic_params():
    """End-to-end: lines_eval + delegated baseline (which is now 0 — all kernels native)."""
    from tools.par_kernels.generic_params import (
        delegated_baseline_rtp,
        lines_eval_rtp_from_ir,
    )
    if not WRATH_RTP.is_file():
        pytest.skip("Wrath not in PAR library")
    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    lines_rtp, _ = lines_eval_rtp_from_ir(ir)
    delegated = delegated_baseline_rtp(cf)
    # All previously-delegated components now have native W244 kernels →
    # delegated_baseline_rtp returns 0.
    assert delegated == 0.0
    # With scatter-aware enumeration, lines_rtp ≡ published base_line.
    assert abs(lines_rtp - cf["components"]["base_line"]) < 5e-5
