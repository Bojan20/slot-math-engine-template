#!/usr/bin/env python3
"""W244 wave 34 — Python ↔ Rust parity gate for math kernels.

For each ported kernel, run the same fixture through both Python and Rust
implementations and assert byte-equivalence (within float64 epsilon × pay).

Emits acceptance JSON. Used by:
  * tests/test_w244_rust_python_parity.py — pytest gate
  * .github/workflows/w244-kernel-attest.yml — CI gate

Currently covered kernels:
  * charge_meter
  * must_hit_by
  * stacked_wilds
  * both_ways
  * pay_anywhere
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
RUST_BIN = REPO / "target" / "release" / "kernel_parity"
OUT = REPO / "reports" / "acceptance" / "RUST_PYTHON_PARITY_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Float-equality tolerance for cross-language compare.
EPS = 1e-10


def _run_rust(kernel: str, params: dict[str, Any]) -> dict[str, Any]:
    """Run the kernel_parity Rust binary with JSON stdin → JSON stdout."""
    if not RUST_BIN.exists():
        raise RuntimeError(
            f"Rust binary not built: {RUST_BIN}\n"
            f"  Run: cd rust-sim && cargo build --release --bin kernel_parity"
        )
    req = json.dumps({"kernel": kernel, "params": params})
    rc = subprocess.run(
        [str(RUST_BIN)],
        input=req,
        capture_output=True,
        text=True,
        timeout=10,
    )
    if rc.returncode != 0:
        raise RuntimeError(
            f"Rust binary failed (exit {rc.returncode}): {rc.stderr}\n"
            f"  stdout: {rc.stdout}"
        )
    return json.loads(rc.stdout)


def _compare_rtp(py_result: dict, rust_result: dict, kernel: str) -> dict:
    """Compare rtp_contribution + key metrics between Python and Rust."""
    py_rtp = py_result.get("rtp_contribution")
    rust_rtp = rust_result.get("rtp_contribution")
    if py_rtp is None or rust_rtp is None:
        return {
            "kernel": kernel,
            "status": "MISSING_FIELD",
            "py_rtp": py_rtp,
            "rust_rtp": rust_rtp,
        }
    delta = abs(py_rtp - rust_rtp)
    return {
        "kernel": kernel,
        "status": "OK" if delta < EPS else "MISMATCH",
        "py_rtp": py_rtp,
        "rust_rtp": rust_rtp,
        "delta": delta,
        "within_eps": delta < EPS,
    }


# ─── Fixtures (mirror Python kernel builder fixtures) ────────────────


def fixture_charge_meter() -> tuple[dict, dict]:
    """3-tier multi-meter."""
    py_params = {
        "expected_charge_per_spin": 1.0,
        "tiers_yaml": [
            ("small", 20.0, 4.0),
            ("medium", 100.0, 30.0),
            ("grand", 1000.0, 500.0),
        ],
    }
    rust_params = {
        "expected_charge_per_spin": 1.0,
        "tiers": [
            {"name": "small", "threshold": 20.0, "award_value_x_bet": 4.0,
             "award_kind": "credit_x_bet"},
            {"name": "medium", "threshold": 100.0, "award_value_x_bet": 30.0,
             "award_kind": "credit_x_bet"},
            {"name": "grand", "threshold": 1000.0, "award_value_x_bet": 500.0,
             "award_kind": "credit_x_bet"},
        ],
    }
    return py_params, rust_params


def fixture_stacked_wilds() -> tuple[dict, dict]:
    py_params = {
        "n_reels": 5,
        "p_stacked_per_reel": 0.04,
        "pay": {0: 0.0, 1: 0.5, 2: 5.0, 3: 50.0, 4: 500.0, 5: 25_000.0},
    }
    rust_params = {
        "n_reels": 5,
        "p_stacked_per_reel": 0.04,
        "pay_per_stacked_count": {
            "0": 0.0, "1": 0.5, "2": 5.0, "3": 50.0, "4": 500.0, "5": 25_000.0,
        },
    }
    return py_params, rust_params


def fixture_must_hit_by() -> tuple[dict, dict]:
    pots = [
        ("mini",  10.0,     0.0005, 100.0,     1e-4),
        ("minor", 50.0,     0.001,  500.0,     1e-5),
        ("major", 500.0,    0.002,  5_000.0,   1e-6),
        ("grand", 10_000.0, 0.005,  100_000.0, 1e-7),
    ]
    py_params = {"pots_tuples": pots}
    rust_params = {
        "pots": [
            {
                "name": n, "seed_x_bet": s, "contribution_x": c,
                "must_hit_by_x_bet": m, "p_strike_per_spin": ps,
            }
            for n, s, c, m, ps in pots
        ],
    }
    return py_params, rust_params


def fixture_both_ways() -> tuple[dict, dict]:
    py_params = {"ltr_only_rtp": 0.96, "line_pay_share": 0.7}
    rust_params = {"ltr_only_rtp": 0.96, "line_pay_share": 0.7}
    return py_params, rust_params


def fixture_pay_anywhere() -> tuple[dict, dict]:
    pay = {8: 5.0, 10: 20.0, 12: 100.0, 14: 500.0}
    py_params = {
        "n_cells": 30, "p_per_cell": 0.07, "pay_table": pay,
        "min_pay_count": 8,
    }
    rust_params = {
        "n_cells": 30, "p_per_cell": 0.07,
        "pay_table": {str(k): v for k, v in pay.items()},
        "min_pay_count": 8,
        "symbol_name": "",
    }
    return py_params, rust_params


# ─── Python kernel runners ───────────────────────────────────────────


def _py_charge_meter(p: dict) -> dict:
    from tools.math_dsl.charge_meter import (
        ChargeMeterParams, ChargeTier, charge_meter_rtp,
    )
    tiers = tuple(
        ChargeTier(name, threshold, award)
        for name, threshold, award in p["tiers_yaml"]
    )
    return charge_meter_rtp(ChargeMeterParams(
        expected_charge_per_spin=p["expected_charge_per_spin"],
        tiers=tiers,
    ))


def _py_stacked_wilds(p: dict) -> dict:
    from tools.math_dsl.stacked_wilds import StackedWildsParams, stacked_wilds_rtp
    return stacked_wilds_rtp(StackedWildsParams(
        n_reels=p["n_reels"],
        p_stacked_per_reel=p["p_stacked_per_reel"],
        pay_per_stacked_count=p["pay"],
    ))


def _py_must_hit_by(p: dict) -> dict:
    from tools.math_dsl.must_hit_by import (
        MustHitByParams, MustHitByPot, must_hit_by_rtp,
    )
    pots = tuple(
        MustHitByPot(n, s, c, m, ps)
        for n, s, c, m, ps in p["pots_tuples"]
    )
    return must_hit_by_rtp(MustHitByParams(pots=pots))


def _py_both_ways(p: dict) -> dict:
    from tools.math_dsl.both_ways import BothWaysParams, both_ways_rtp
    return both_ways_rtp(BothWaysParams(
        ltr_only_rtp=p["ltr_only_rtp"],
        line_pay_share=p["line_pay_share"],
    ))


def _py_pay_anywhere(p: dict) -> dict:
    from tools.math_dsl.pay_anywhere import PayAnywhereParams, pay_anywhere_rtp
    return pay_anywhere_rtp(PayAnywhereParams(
        n_cells=p["n_cells"],
        p_per_cell=p["p_per_cell"],
        pay_table=p["pay_table"],
        min_pay_count=p["min_pay_count"],
    ))


def fixture_cluster_pays() -> tuple[dict, dict]:
    dist = {"A": {5: 0.1, 6: 0.05}, "B": {5: 0.2}}
    pay = {"A": {5: 2.0, 6: 5.0}, "B": {5: 1.0}}
    py_params = {"dist": dist, "pay": pay, "min_size": 5}
    rust_params = {
        "cluster_count_distribution": {
            sym: {str(k): v for k, v in sub.items()} for sym, sub in dist.items()
        },
        "pay_table": {
            sym: {str(k): v for k, v in sub.items()} for sym, sub in pay.items()
        },
        "min_cluster_size": 5,
        "grid_rows": 5, "grid_cols": 6,
        "adjacency": "4-way",
    }
    return py_params, rust_params


def fixture_cascade() -> tuple[dict, dict]:
    py_params = {
        "p_initial_win": 0.27,
        "base_pay_per_cascade_x_bet": 0.3,
        "p_win_per_cascade": 0.40,
        "multiplier_ladder": (1.0, 1.0, 2.0, 2.0, 5.0, 5.0, 25.0, 25.0),
        "max_chain": 8,
    }
    rust_params = {
        "p_initial_win": 0.27,
        "base_pay_per_cascade_x_bet": 0.3,
        "p_win_per_cascade": 0.40,
        "multiplier_ladder": [1.0, 1.0, 2.0, 2.0, 5.0, 5.0, 25.0, 25.0],
        "max_chain": 8,
    }
    return py_params, rust_params


def fixture_money_collect() -> tuple[dict, dict]:
    value_table = {1.0: 50.0, 2.0: 30.0, 5.0: 15.0, 10.0: 4.0, 50.0: 1.0}
    py_params = {
        "p_per_cell": 0.04, "n_cells": 15, "trigger_count_min": 6,
        "respins_reset": 3, "grid_cap": 15,
        "value_table": value_table,
    }
    rust_params = {
        "p_per_cell": 0.04, "n_cells": 15, "trigger_count_min": 6,
        "respins_reset": 3, "grid_cap": 15,
        "value_table": {str(k): v for k, v in value_table.items()},
    }
    return py_params, rust_params


def _py_cluster_pays(p: dict) -> dict:
    from tools.math_dsl.cluster_pays import ClusterPaysParams, cluster_pays_rtp
    return cluster_pays_rtp(ClusterPaysParams(
        cluster_count_distribution=p["dist"],
        pay_table=p["pay"],
        min_cluster_size=p["min_size"],
    ))


def _py_cascade(p: dict) -> dict:
    from tools.math_dsl.cascade import CascadeParams, cascade_rtp
    return cascade_rtp(CascadeParams(
        p_initial_win=p["p_initial_win"],
        base_pay_per_cascade_x_bet=p["base_pay_per_cascade_x_bet"],
        p_win_per_cascade=p["p_win_per_cascade"],
        multiplier_ladder=p["multiplier_ladder"],
        max_chain=p["max_chain"],
    ))


def _py_money_collect(p: dict) -> dict:
    from tools.math_dsl.money_collect import (
        MoneyCollectParams, money_collect_rtp_contribution,
    )
    return money_collect_rtp_contribution(MoneyCollectParams(
        p_per_cell=p["p_per_cell"],
        n_cells=p["n_cells"],
        trigger_count_min=p["trigger_count_min"],
        value_table=p["value_table"],
        respins_reset=p["respins_reset"],
        grid_cap=p["grid_cap"],
    ))


def fixture_state_machine() -> tuple[dict, dict]:
    py_params = {
        "states_tuples": [("base", 0.96), ("super", 2.50)],
        "transitions": ((0.99, 0.01), (0.50, 0.50)),
    }
    rust_params = {
        "states": [{"name": "base", "rtp_component": 0.96},
                   {"name": "super", "rtp_component": 2.50}],
        "transitions": [[0.99, 0.01], [0.50, 0.50]],
    }
    return py_params, rust_params


def fixture_persistent_multiplier() -> tuple[dict, dict]:
    common = dict(
        fs_trigger_p=0.005, fs_initial_spins=10,
        base_pay_per_spin_x_bet=0.5,
        initial_multiplier=1.0, bump_increment=1.0,
        p_bump_per_spin=0.3,
    )
    py_params = {**common, "max_multiplier": None}
    rust_params = {**common, "max_multiplier": None}
    return py_params, rust_params


def fixture_ways_evaluator() -> tuple[dict, dict]:
    py_params = {
        "row_dist": [{3: 1.0}] * 5,
        "per_way_rtp": 0.96 / 243,
    }
    rust_params = {
        "row_distribution_per_reel": [{"3": 1.0}] * 5,
        "per_way_rtp_x_bet": 0.96 / 243,
    }
    return py_params, rust_params


def fixture_sticky_wilds() -> tuple[dict, dict]:
    pay = {1: 0.5, 2: 1.5, 3: 5.0, 4: 25.0, 5: 100.0}
    common = dict(
        trigger_p=0.012, n_respins=3, n_cells=15,
        p_wild_per_cell_per_respin=0.06, initial_wilds=1,
    )
    py_params = {**common, "pay_per_wild_count": pay}
    rust_params = {**common, "pay_per_wild_count": {str(k): v for k, v in pay.items()}}
    return py_params, rust_params


def fixture_pick_chain() -> tuple[dict, dict]:
    # Single-level all-credit, 6 picks × 2.0 = 12, trig=0.01 → RTP=0.12
    py_params = {
        "trigger_p": 0.01,
        "levels": [{"name": "L1", "pool_size": 6,
                    "award_distribution": {2.0: 6}}],
    }
    rust_params = {
        "trigger_p": 0.01,
        "levels": [{"name": "L1", "pool_size": 6,
                    "award_distribution": {"2.0": 6}}],
    }
    return py_params, rust_params


def fixture_buy_feature() -> tuple[dict, dict]:
    common = dict(
        bonus_average_pay_x_bet=96.0,
        buy_cost_x_bet=100.0,
        base_game_rtp=0.96,
        target_buy_rtp=0.96,
    )
    return common, common


def _py_state_machine(p: dict) -> dict:
    from tools.math_dsl.state_machine import (
        GameState, StateMachineParams, state_machine_rtp,
    )
    states = tuple(GameState(name, rtp) for name, rtp in p["states_tuples"])
    return state_machine_rtp(StateMachineParams(
        states=states, transitions=p["transitions"],
    ))


def _py_persistent_multiplier(p: dict) -> dict:
    from tools.math_dsl.persistent_multiplier import (
        PersistentMultiplierParams, persistent_multiplier_rtp,
    )
    return persistent_multiplier_rtp(PersistentMultiplierParams(**p))


def _py_ways_evaluator(p: dict) -> dict:
    from tools.math_dsl.ways_evaluator import (
        WaysEvaluatorParams, ways_evaluator_rtp,
    )
    return ways_evaluator_rtp(WaysEvaluatorParams(
        row_distribution_per_reel=tuple(p["row_dist"]),
        per_way_rtp_x_bet=p["per_way_rtp"],
    ))


def _py_sticky_wilds(p: dict) -> dict:
    from tools.math_dsl.sticky_wilds import StickyWildsParams, sticky_wilds_rtp
    return sticky_wilds_rtp(StickyWildsParams(**p))


def _py_pick_chain(p: dict) -> dict:
    from tools.math_dsl.pick_chain import PickChainParams, PickLevel, pick_chain_rtp
    levels = tuple(PickLevel(
        name=lvl["name"],
        pool_size=lvl["pool_size"],
        award_distribution=lvl["award_distribution"],
    ) for lvl in p["levels"])
    return pick_chain_rtp(PickChainParams(
        trigger_p=p["trigger_p"], levels=levels,
    ))


def _py_buy_feature(p: dict) -> dict:
    from tools.math_dsl.buy_feature import BuyFeatureParams, buy_feature_audit
    return buy_feature_audit(BuyFeatureParams(**p))


# ─── Wave 37 — 4 more parity fixtures ─────────────────────────────────


def fixture_expanding_symbol() -> tuple[dict, dict]:
    pay = {3: 1.0, 4: 5.0, 5: 100.0}
    common = dict(
        fs_trigger_p=0.005, fs_initial_spins=10,
        reels=5, rows=3, p_per_cell_in_fs=0.12,
    )
    py_params = {**common, "pay_table": pay, "symbol_name": "explorer"}
    rust_params = {
        **common,
        "pay_table": {str(k): v for k, v in pay.items()},
        "symbol_name": "explorer",
    }
    return py_params, rust_params


def fixture_wheel() -> tuple[dict, dict]:
    segs = [
        ("no_win", 4.0, 0.0, ""),
        ("credit", 3.0, 10.0, ""),
        ("credit", 2.0, 50.0, ""),
        ("credit", 1.0, 200.0, ""),
    ]
    py_params = {"trigger_p": 0.05, "segs": segs, "max_again": 5}
    rust_params = {
        "trigger_p": 0.05,
        "segments": [{"kind": k, "weight": w, "value_x_bet": v,
                      "jackpot_id": jid}
                     for k, w, v, jid in segs],
        "max_spin_again": 5,
    }
    return py_params, rust_params


def fixture_asymmetric_paytable() -> tuple[dict, dict]:
    contrib = {
        "A": {"left_only": 0.20, "any": 0.05},
        "B": {"any": 0.15},
    }
    py_params = {"contrib": contrib}
    rust_params = {"per_symbol_contributions": contrib}
    return py_params, rust_params


def fixture_hold_and_win() -> tuple[dict, dict]:
    # Lightning Link-style: money_collect + 4-tier pots
    money_value_table = {1.0: 50.0, 2.0: 30.0, 5.0: 15.0, 10.0: 4.0, 50.0: 1.0}
    pots = [
        ("mini",  10.0,     0.0005, 100.0,     1e-4),
        ("minor", 50.0,     0.001,  500.0,     1e-5),
        ("major", 500.0,    0.002,  5_000.0,   1e-6),
        ("grand", 10_000.0, 0.005,  100_000.0, 1e-7),
    ]
    py_params = {"money_value_table": money_value_table, "pots": pots}
    rust_params = {
        "money_params": {
            "p_per_cell": 0.04, "n_cells": 15, "trigger_count_min": 6,
            "respins_reset": 3, "grid_cap": 15,
            "value_table": {str(k): v for k, v in money_value_table.items()},
        },
        "jackpot_pots": [
            {"name": n, "seed_x_bet": s, "contribution_x": c,
             "must_hit_by_x_bet": m, "p_strike_per_spin": ps}
            for n, s, c, m, ps in pots
        ],
    }
    return py_params, rust_params


def _py_expanding_symbol(p: dict) -> dict:
    from tools.math_dsl.expanding_symbol import (
        ExpandingSymbolParams, expanding_symbol_rtp,
    )
    return expanding_symbol_rtp(ExpandingSymbolParams(**p))


def _py_wheel(p: dict) -> dict:
    from tools.math_dsl.wheel import WheelParams, WheelSegment, wheel_rtp
    segs = tuple(
        WheelSegment(kind=k, weight=w, value_x_bet=v, jackpot_id=jid)
        for k, w, v, jid in p["segs"]
    )
    return wheel_rtp(WheelParams(
        trigger_p=p["trigger_p"], segments=segs, max_spin_again=p["max_again"],
    ))


def _py_asymmetric_paytable(p: dict) -> dict:
    from tools.math_dsl.asymmetric_paytable import (
        AsymmetricPaytableParams, asymmetric_paytable_rtp,
    )
    return asymmetric_paytable_rtp(AsymmetricPaytableParams(
        per_symbol_contributions=p["contrib"],
    ))


def _py_hold_and_win(p: dict) -> dict:
    from tools.math_dsl.hold_and_win import HoldAndWinParams, hold_and_win_rtp
    from tools.math_dsl.money_collect import MoneyCollectParams
    from tools.math_dsl.must_hit_by import MustHitByPot
    money = MoneyCollectParams(
        p_per_cell=0.04, n_cells=15, trigger_count_min=6,
        respins_reset=3, grid_cap=15,
        value_table=p["money_value_table"],
    )
    pots = tuple(
        MustHitByPot(n, s, c, m, ps) for n, s, c, m, ps in p["pots"]
    )
    return hold_and_win_rtp(HoldAndWinParams(money_params=money, jackpot_pots=pots))


KERNELS = [
    ("charge_meter", fixture_charge_meter, _py_charge_meter),
    ("stacked_wilds", fixture_stacked_wilds, _py_stacked_wilds),
    ("must_hit_by", fixture_must_hit_by, _py_must_hit_by),
    ("both_ways", fixture_both_ways, _py_both_ways),
    ("pay_anywhere", fixture_pay_anywhere, _py_pay_anywhere),
    ("cluster_pays", fixture_cluster_pays, _py_cluster_pays),
    ("cascade", fixture_cascade, _py_cascade),
    ("money_collect", fixture_money_collect, _py_money_collect),
    ("state_machine", fixture_state_machine, _py_state_machine),
    ("persistent_multiplier", fixture_persistent_multiplier, _py_persistent_multiplier),
    ("ways_evaluator", fixture_ways_evaluator, _py_ways_evaluator),
    ("sticky_wilds", fixture_sticky_wilds, _py_sticky_wilds),
    ("pick_chain", fixture_pick_chain, _py_pick_chain),
    ("buy_feature", fixture_buy_feature, _py_buy_feature),
    ("expanding_symbol", fixture_expanding_symbol, _py_expanding_symbol),
    ("wheel", fixture_wheel, _py_wheel),
    ("asymmetric_paytable", fixture_asymmetric_paytable, _py_asymmetric_paytable),
    # hold_and_win — composed kernel, Python returns nested money + jackpot
    # components. Currently Rust port has hold_and_win.rs but parity needs
    # special composed handling. Adding incrementally next wave.
]


def main() -> int:
    records = []
    all_match = True
    for kernel, fixture_fn, py_runner in KERNELS:
        py_params, rust_params = fixture_fn()
        py_result = py_runner(py_params)
        rust_result = _run_rust(kernel, rust_params)
        cmp = _compare_rtp(py_result, rust_result, kernel)
        records.append(cmp)
        if cmp["status"] != "OK":
            all_match = False

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['kernel']}|status={r['status']}|"
            f"py={r.get('py_rtp', 'NA')}|"
            f"rust={r.get('rust_rtp', 'NA')}|"
            f"delta={r.get('delta', 'NA')}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode()).hexdigest()

    artifact = {
        "schema": "w244-rust-python-parity/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernels_checked": len(KERNELS),
        "kernels_match": sum(1 for r in records if r["status"] == "OK"),
        "all_match": all_match,
        "epsilon": EPS,
        "rust_binary": str(RUST_BIN.relative_to(REPO)),
        "records": records,
        "verification": (
            "Re-build Rust binary (`cargo build --release --bin kernel_parity`), "
            "re-run this script. Output must match committed merkle_root."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))

    print(f"[w244-parity] wrote {OUT.relative_to(REPO)}")
    print(f"  kernels checked: {len(KERNELS)}")
    print(f"  matches:         {artifact['kernels_match']} / {len(KERNELS)}")
    for r in records:
        sym = "✓" if r["status"] == "OK" else "✗"
        print(f"    {sym} {r['kernel']:20s}  py={r.get('py_rtp', 'NA'):.10g}  "
              f"rust={r.get('rust_rtp', 'NA'):.10g}  "
              f"Δ={r.get('delta', 'NA'):.2e}")
    print(f"  merkle root:     {merkle_root}")
    return 0 if all_match else 1


if __name__ == "__main__":
    sys.exit(main())
