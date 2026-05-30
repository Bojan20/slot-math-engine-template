"""W244 wave 43 — composed showcase: asymmetric_paytable + base game integration.

DONE-UNIVERSAL #2: Asymmetric paytable showcase.

Industry pattern (NetEnt Twin Spin asymmetric reels, Yggdrasil Wild West
Gold, Microgaming Wild Toro):

  Per-symbol pay depends on REEL-SET SHAPE (which reels show the symbol),
  not just k-of-a-kind. Operator supplies per-(symbol, shape) contribution
  table sourced from PAR or MC; kernel aggregates.

  Asymmetric showcase = single asymmetric_paytable kernel run in
  realistic 5-reel game shape with HP/MP/LP symbols.

Used by:
  * `tools.build_asymmetric_showcase_kernel` — acceptance artefakt
  * `tests/test_w244_asymmetric_showcase_kernel.py` — pin
"""
from __future__ import annotations

from tools.math_dsl.asymmetric_paytable import (
    AsymmetricPaytableParams, asymmetric_paytable_rtp,
)


def twin_spin_proxy() -> AsymmetricPaytableParams:
    """NetEnt Twin Spin asymmetric reels — twin/triple/quad/quint shapes.

    Public-spec proxy (not vendor-derived). Each symbol's contribution
    varies by how many reels show it after the Twin Spin / Triple Spin
    / Quad Spin reel-link.
    """
    return AsymmetricPaytableParams(
        per_symbol_contributions={
            "hp1": {"twin": 0.05, "triple": 0.10, "quad": 0.08, "quint": 0.04},
            "hp2": {"twin": 0.04, "triple": 0.08, "quad": 0.06, "quint": 0.03},
            "lp1": {"twin": 0.10, "triple": 0.06, "quad": 0.03, "quint": 0.01},
            "lp2": {"twin": 0.12, "triple": 0.05, "quad": 0.02, "quint": 0.005},
        },
    )


def wild_west_gold_proxy() -> AsymmetricPaytableParams:
    """Yggdrasil Wild West Gold — left-anchored shape (3/4/5)."""
    return AsymmetricPaytableParams(
        per_symbol_contributions={
            "sheriff": {"left_3": 0.04, "left_4": 0.08, "left_5": 0.20},
            "cowboy":  {"left_3": 0.06, "left_4": 0.10, "left_5": 0.18},
            "horse":   {"left_3": 0.08, "left_4": 0.10, "left_5": 0.12},
            "ace":     {"left_3": 0.15, "left_4": 0.10, "left_5": 0.05},
        },
    )


def wild_toro_proxy() -> AsymmetricPaytableParams:
    """Microgaming Wild Toro — single/stack-2/stack-3 asymmetric."""
    return AsymmetricPaytableParams(
        per_symbol_contributions={
            "toro":    {"single": 0.05, "stack_2": 0.10, "stack_3": 0.15},
            "matador": {"single": 0.08, "stack_2": 0.06, "stack_3": 0.04},
            "ribbon":  {"single": 0.12, "stack_2": 0.04, "stack_3": 0.02},
        },
    )


def asymmetric_showcase_run(proxy_name: str) -> dict:
    """Run one of the canonical asymmetric showcase proxies."""
    factory = {
        "twin_spin": twin_spin_proxy,
        "wild_west_gold": wild_west_gold_proxy,
        "wild_toro": wild_toro_proxy,
    }
    if proxy_name not in factory:
        raise ValueError(
            f"unknown proxy_name {proxy_name!r}, "
            f"expected one of {sorted(factory.keys())}"
        )
    params = factory[proxy_name]()
    result = asymmetric_paytable_rtp(params)
    return {
        "proxy_name": proxy_name,
        "rtp_contribution": result["rtp_contribution"],
        "symbols_count": result["symbols_count"],
        "per_symbol_breakdown": result["per_symbol_breakdown"],
    }
