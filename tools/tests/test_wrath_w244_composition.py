"""SLOT-MATH W244 Composer — Wrath of Olympus closed-form parity gate.

Asserts that the slot-math W244 kernels, when fed Wrath's published
trigger probabilities + per-feature RTP slices, reproduce Wrath's
own closed-form total RTP to sub-bps precision.

This is the FIRST end-to-end real-game math evaluation gate in the
slot-math repo. Until now all kernel tests used synthetic params;
this gate proves the kernels can ingest a real production-locked
game's math and round-trip it exactly.

What this gate proves:
  * `expanding_symbol` kernel reproduces Wrath's FS RTP contribution
    (20.0922%) when fed Wrath's FS trigger probability + session E.
  * `hold_and_win` kernel reproduces Wrath's H&W RTP contribution
    (39.6979%) when fed Wrath's H&W trigger probability + session E.
  * The W244 dispatcher correctly maps Wrath's IR features to the
    appropriate kernels.
  * The composer sums all kernel contributions + Wrath's delegated
    baseline (base_line + scatter + lightning_uplift = 36.346%) to
    a total within 1 bps of Wrath's published closed-form RTP
    (96.136%).

What this gate does NOT prove:
  * The base-line RTP (27.82%) is delegated to Wrath's own per-line
    enumeration — slot-math has no kernel that re-enumerates 14⁵×10
    paylines. The lightning_uplift and scatter_pay_base are similarly
    delegated. The composer assertion is "kernel sum + delegated
    baseline = published total", not "kernel sum from scratch".

Skip condition: this test skips if the Wrath PAR library entry is
not present in this checkout.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest


REPO = Path(__file__).resolve().parents[2]
WRATH_IR = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/game.ir.json"
WRATH_RTP = REPO / "reports/par-library/wrath-of-olympus/v12.0.0/closed-form-rtp.json"


def _wrath_present() -> bool:
    return WRATH_IR.is_file() and WRATH_RTP.is_file()


skip_no_wrath = pytest.mark.skipif(
    not _wrath_present(),
    reason="Wrath PAR library entry missing — run the import bridge first",
)


@skip_no_wrath
def test_wrath_w244_composition_round_trip():
    """End-to-end: dispatch → kernels → sum → matches Wrath CF total to ≤ 1 bps."""
    from tools.par_kernels.composer import compose
    from tools.par_kernels.wrath_params import (
        build_wrath_params, wrath_baseline_rtp_offset,
    )

    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    target_rtp = cf["total_rtp"]
    par = {"rtp": {"rtp_total": target_rtp}}

    result = compose(ir, par=par, params_builder=build_wrath_params)
    delegated = wrath_baseline_rtp_offset(par)
    composed_total = result.composed_rtp + delegated
    delta_bps = (composed_total - target_rtp) * 10000.0

    assert abs(delta_bps) <= 1.0, (
        f"Wrath W244 composition off by {delta_bps:+.4f} bps "
        f"(composed={composed_total:.6%}, target={target_rtp:.6%})\n"
        f"Per-kernel:\n{result.summary()}"
    )


@skip_no_wrath
def test_wrath_dispatcher_picks_three_kernels():
    """W244 dispatcher must select exactly: asymmetric_paytable + expanding_symbol + hold_and_win."""
    from tools.par_to_ir.dispatcher import dispatch_kernels

    ir = json.loads(WRATH_IR.read_text())
    composition = dispatch_kernels(ir)
    kernel_ids = {c["kernel_id"] for c in composition}

    expected = {"asymmetric_paytable", "expanding_symbol", "hold_and_win"}
    assert kernel_ids == expected, (
        f"Dispatcher selected {kernel_ids}, expected {expected}"
    )


@skip_no_wrath
def test_wrath_fs_kernel_matches_published_component():
    """expanding_symbol kernel output must equal published `components.fs`."""
    from tools.par_kernels.composer import compose
    from tools.par_kernels.wrath_params import build_wrath_params

    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    target_fs = cf["components"]["fs"]

    result = compose(ir, par={"rtp": {"rtp_total": cf["total_rtp"]}},
                     params_builder=build_wrath_params)
    fs_kernel = next(k for k in result.per_kernel if k.kernel_id == "expanding_symbol")
    assert fs_kernel.error is None, f"FS kernel errored: {fs_kernel.error}"
    delta_bps = (fs_kernel.rtp_contribution - target_fs) * 10000.0
    assert abs(delta_bps) <= 0.5, (
        f"FS kernel off by {delta_bps:+.4f} bps "
        f"(kernel={fs_kernel.rtp_contribution:.6%}, target={target_fs:.6%})"
    )


@skip_no_wrath
def test_wrath_hnw_kernel_matches_published_component():
    """hold_and_win kernel output must equal published `components.hnw`."""
    from tools.par_kernels.composer import compose
    from tools.par_kernels.wrath_params import build_wrath_params

    ir = json.loads(WRATH_IR.read_text())
    cf = json.loads(WRATH_RTP.read_text())
    target_hnw = cf["components"]["hnw"]

    result = compose(ir, par={"rtp": {"rtp_total": cf["total_rtp"]}},
                     params_builder=build_wrath_params)
    hnw_kernel = next(k for k in result.per_kernel if k.kernel_id == "hold_and_win")
    assert hnw_kernel.error is None, f"H&W kernel errored: {hnw_kernel.error}"
    delta_bps = (hnw_kernel.rtp_contribution - target_hnw) * 10000.0
    assert abs(delta_bps) <= 1.0, (
        f"H&W kernel off by {delta_bps:+.4f} bps "
        f"(kernel={hnw_kernel.rtp_contribution:.6%}, target={target_hnw:.6%})"
    )


@skip_no_wrath
def test_wrath_delegated_baseline_sums_correctly():
    """base_line + scatter_pay_base + lightning_uplift = 36.346%."""
    from tools.par_kernels.wrath_params import wrath_baseline_rtp_offset

    cf = json.loads(WRATH_RTP.read_text())
    c = cf["components"]
    expected = c["base_line"] + c["scatter_pay_base"] + c["lightning_uplift"]
    actual = wrath_baseline_rtp_offset(par=None)
    assert abs(actual - expected) < 1e-12, (
        f"Delegated baseline mismatch: {actual} vs {expected}"
    )
