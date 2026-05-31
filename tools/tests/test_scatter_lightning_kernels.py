"""SLOT-MATH W244 — scatter_pay + lightning_uplift kernel gates.

Closes the LAST two delegated baseline slices. After this commit slot-math
reproduces Wrath's CF total entirely from W244 kernels (no delegation).
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
WRATH_IR = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/game.ir.json"
WRATH_RTP = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/closed-form-rtp.json"

skip_no_wrath = pytest.mark.skipif(
    not WRATH_IR.is_file(),
    reason="Wrath not in PAR library",
)


@skip_no_wrath
def test_scatter_pay_exact_wrath_parity():
    """scatter_pay kernel ≡ Wrath's published scatter_pay_base to float-ULP."""
    from tools.par_kernels.scatter_pay import (
        build_scatter_pay_params_from_ir, scatter_pay_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    params = build_scatter_pay_params_from_ir(ir)
    assert params is not None
    result = scatter_pay_rtp(params)
    target = cf["components"]["scatter_pay_base"]
    delta_bps = (result["rtp_contribution"] - target) * 10000.0
    assert abs(delta_bps) <= 0.5, (
        f"scatter_pay off by {delta_bps:+.6f} bps "
        f"(computed {result['rtp_contribution']:.6%}, target {target:.6%})"
    )


@skip_no_wrath
def test_scatter_pay_trigger_p_matches_wrath():
    """scatter_pay kernel's FS trigger P ≡ published triggers.fs.p."""
    from tools.par_kernels.scatter_pay import (
        build_scatter_pay_params_from_ir, scatter_pay_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    params = build_scatter_pay_params_from_ir(ir)
    result = scatter_pay_rtp(params)
    target_p = cf["triggers"]["fs"]["p"]
    assert abs(result["trigger_p"] - target_p) < 1e-9


@skip_no_wrath
def test_lightning_uplift_exact_wrath_parity():
    """lightning_uplift kernel ≡ Wrath's published lightning_uplift to float-ULP."""
    from tools.par_kernels.lightning_uplift import (
        build_lightning_params_from_ir, lightning_uplift_rtp,
    )
    from tools.par_kernels.lines_eval import (
        build_lines_params_from_ir, lines_eval_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    lines_r = lines_eval_rtp(build_lines_params_from_ir(ir))
    base_rtp = lines_r["rtp_contribution"]

    params = build_lightning_params_from_ir(ir, base_rtp=base_rtp)
    assert params is not None
    result = lightning_uplift_rtp(params)
    target = cf["components"]["lightning_uplift"]
    delta_bps = (result["rtp_contribution"] - target) * 10000.0
    assert abs(delta_bps) <= 0.5, (
        f"lightning_uplift off by {delta_bps:+.6f} bps "
        f"(computed {result['rtp_contribution']:.6%}, target {target:.6%})"
    )


@skip_no_wrath
def test_lightning_uplift_e_mult_correct():
    """E[mult] from distribution ≡ closed-form weighted mean."""
    from tools.par_kernels.lightning_uplift import (
        build_lightning_params_from_ir, lightning_uplift_rtp,
    )
    ir = json.loads(WRATH_IR.read_text())
    # Wrath distribution: {2: 70, 3: 18, 5: 10, 10: 2}, weights sum=100
    # E = (2*70 + 3*18 + 5*10 + 10*2) / 100 = (140+54+50+20)/100 = 264/100 = 2.64
    p = build_lightning_params_from_ir(ir, base_rtp=0.278)
    r = lightning_uplift_rtp(p)
    assert abs(r["e_mult"] - 2.64) < 1e-9


@skip_no_wrath
def test_full_from_scratch_wrath_reconstruction():
    """ALL 5 W244 kernels combined ≡ Wrath published total to float-ULP."""
    from tools.par_kernels.composer import compose
    from tools.par_kernels.generic_params import (
        lightning_uplift_rtp_from_ir,
        lines_eval_rtp_from_ir,
        make_params_builder,
        scatter_pay_rtp_from_ir,
    )

    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    target = cf["total_rtp"]

    # 5 W244 kernel slices
    base_rtp, _ = lines_eval_rtp_from_ir(ir)
    scatter_rtp, _ = scatter_pay_rtp_from_ir(ir)
    lightning_rtp, _ = lightning_uplift_rtp_from_ir(ir, base_rtp=base_rtp)
    comp = compose(ir, par={"rtp": {"rtp_total": target}},
                   params_builder=make_params_builder(cf))
    features_rtp = comp.composed_rtp

    total = base_rtp + scatter_rtp + lightning_rtp + features_rtp
    delta_bps = (total - target) * 10000.0

    assert abs(delta_bps) <= 0.001, (
        f"From-scratch reconstruction off by {delta_bps:+.6f} bps\n"
        f"  base_line:       {base_rtp:.6%} (target {cf['components']['base_line']:.6%})\n"
        f"  scatter_pay:     {scatter_rtp:.6%} (target {cf['components']['scatter_pay_base']:.6%})\n"
        f"  lightning:       {lightning_rtp:.6%} (target {cf['components']['lightning_uplift']:.6%})\n"
        f"  features:        {features_rtp:.6%}\n"
        f"  TOTAL:           {total:.6%}\n"
        f"  TARGET:          {target:.6%}"
    )


def test_scatter_pay_synthetic_3of3_payable():
    """Synthetic 3-reel single-scatter game: P(3 scatters) × pay must match."""
    from tools.par_kernels.scatter_pay import ScatterPayParams, scatter_pay_rtp
    # 3 reels, each with P(S) = 0.1 per cell, 3 rows.
    # P(reel has scatter) = 1 - 0.9^3 = 0.271
    # P(all 3 reels have scatter) = 0.271^3 = 0.01991
    # RTP = 0.01991 × pay[3] = 0.01991 × 100 = 1.991
    reels = [{"S": 1, "X": 9}, {"S": 1, "X": 9}, {"S": 1, "X": 9}]
    p = ScatterPayParams(
        reel_weights=reels, rows=3, scatter_symbol="S",
        scatter_pays={3: 100.0},
    )
    r = scatter_pay_rtp(p)
    expected_rtp = (1 - 0.9**3) ** 3 * 100.0
    assert abs(r["rtp_contribution"] - expected_rtp) < 1e-6


def test_lightning_uplift_zero_when_no_trigger():
    """trigger_p=0 ⇒ RTP contribution = 0."""
    from tools.par_kernels.lightning_uplift import (
        LightningUpliftParams, lightning_uplift_rtp,
    )
    p = LightningUpliftParams(
        base_rtp=0.3, trigger_p=0.0,
        multiplier_distribution={2.0: 1.0, 5.0: 1.0},
    )
    r = lightning_uplift_rtp(p)
    assert r["rtp_contribution"] == 0.0


def test_lightning_uplift_unit_multiplier_zero_uplift():
    """E[mult]=1.0 ⇒ uplift = 0 (no contribution, since 1× is the no-op)."""
    from tools.par_kernels.lightning_uplift import (
        LightningUpliftParams, lightning_uplift_rtp,
    )
    p = LightningUpliftParams(
        base_rtp=0.3, trigger_p=0.5,
        multiplier_distribution={1.0: 1.0},
    )
    r = lightning_uplift_rtp(p)
    assert r["rtp_contribution"] == 0.0
    assert r["e_mult"] == 1.0
