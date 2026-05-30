#!/usr/bin/env python3
"""W244 wave 27 — deterministic acceptance for `hold_and_win`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.hold_and_win import HoldAndWinParams, hold_and_win_rtp
from tools.math_dsl.money_collect import MoneyCollectParams
from tools.math_dsl.must_hit_by import MustHitByPot

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "HOLD_AND_WIN_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "lightning-link-4tier",
        "description": "IGT Lightning Link: money collect + mini/minor/major/grand pots",
        "params": HoldAndWinParams(
            money_params=MoneyCollectParams(
                p_per_cell=0.04, n_cells=15, trigger_count_min=6,
                respins_reset=3, grid_cap=15,
                value_table={1.0: 50.0, 2.0: 30.0, 5.0: 15.0, 10.0: 4.0, 50.0: 1.0},
            ),
            jackpot_pots=(
                MustHitByPot("mini",  10,     0.0005, 100,     p_strike_per_spin=1e-4),
                MustHitByPot("minor", 50,     0.001,  500,     p_strike_per_spin=1e-5),
                MustHitByPot("major", 500,    0.002,  5_000,   p_strike_per_spin=1e-6),
                MustHitByPot("grand", 10_000, 0.005,  100_000, p_strike_per_spin=1e-7),
            ),
        ),
    },
    {
        "name": "dragon-cash-2tier",
        "description": "Aristocrat Dragon Cash: money collect + minor/grand only",
        "params": HoldAndWinParams(
            money_params=MoneyCollectParams(
                p_per_cell=0.05, n_cells=20, trigger_count_min=6,
                respins_reset=3, grid_cap=20,
                value_table={1.0: 40.0, 5.0: 25.0, 25.0: 8.0, 100.0: 2.0},
            ),
            jackpot_pots=(
                MustHitByPot("minor", 100,    0.001, 1_000),
                MustHitByPot("grand", 50_000, 0.003, 500_000),
            ),
        ),
    },
    {
        "name": "lightning-cash-3tier",
        "description": "Scientific Games Lightning Cash: 3-tier (mini/major/grand)",
        "params": HoldAndWinParams(
            money_params=MoneyCollectParams(
                p_per_cell=0.045, n_cells=15, trigger_count_min=6,
                respins_reset=3, grid_cap=15,
                value_table={1.0: 45.0, 3.0: 30.0, 10.0: 12.0, 50.0: 2.0, 250.0: 1.0},
            ),
            jackpot_pots=(
                MustHitByPot("mini",  20,     0.0008, 200),
                MustHitByPot("major", 1_000,  0.002,  10_000),
                MustHitByPot("grand", 25_000, 0.004,  250_000),
            ),
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = hold_and_win_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"money_rtp={r['money_component']['rtp_contribution']:.15e}|"
            f"jp_rtp={r['jackpot_component']['rtp_contribution']:.15e}|"
            f"total_rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "hold-and-win-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "hold_and_win",
        "module": "tools.math_dsl.hold_and_win",
        "composes": ["tools.math_dsl.money_collect", "tools.math_dsl.must_hit_by"],
        "industry_pattern": (
            "IGT Lightning Link, Aristocrat Dragon Cash, Scientific Games "
            "Lightning Cash, Pragmatic Big Bass H&W, Quickspin Hold'n'Link. "
            "Money-collect + multi-tier jackpot composition."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_hold_and_win_kernel`. Output "
            "must match `merkle_root_sha256` exactly. RTP = money_collect "
            "+ must_hit_by jackpot contributions, summed independently."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[hold-and-win-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  money_rtp={r['money_component']['rtp_contribution']:.4f}  "
              f"jp_rtp={r['jackpot_component']['rtp_contribution']:.4f}  "
              f"total={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
