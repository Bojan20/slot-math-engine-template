#!/usr/bin/env python3
"""W244 wave 23 — deterministic acceptance for `sticky_wilds`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.sticky_wilds import StickyWildsParams, sticky_wilds_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "STICKY_WILDS_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "netent-sticky-bandits-trail",
        "description": "NetEnt Sticky Bandits Trail of Blood: 5×3, 3 respins",
        "params": StickyWildsParams(
            trigger_p=0.012,
            n_respins=3,
            n_cells=15,
            p_wild_per_cell_per_respin=0.06,
            pay_per_wild_count={
                1: 0.5, 2: 1.5, 3: 5.0, 4: 15.0, 5: 50.0,
                6: 150.0, 7: 500.0, 8: 1000.0,
            },
            initial_wilds=1,
        ),
    },
    {
        "name": "pragmatic-pyramid-king",
        "description": "Pragmatic Pyramid King sticky: 5×4, 4 respins, slow respawn",
        "params": StickyWildsParams(
            trigger_p=0.008,
            n_respins=4,
            n_cells=20,
            p_wild_per_cell_per_respin=0.04,
            pay_per_wild_count={
                1: 0.3, 2: 1.0, 3: 4.0, 4: 12.0, 5: 30.0,
                6: 80.0, 7: 200.0, 8: 500.0, 10: 2500.0,
            },
            initial_wilds=2,
        ),
    },
    {
        "name": "jtg-wild-bounty-showdown",
        "description": "JTG Wild Bounty: 6×4, 5 respins, aggressive respawn",
        "params": StickyWildsParams(
            trigger_p=0.015,
            n_respins=5,
            n_cells=24,
            p_wild_per_cell_per_respin=0.08,
            pay_per_wild_count={
                3: 0.5, 4: 1.5, 5: 3.0, 6: 8.0, 7: 20.0,
                8: 50.0, 10: 200.0, 12: 800.0, 15: 5000.0,
            },
            initial_wilds=1,
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = sticky_wilds_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        e_wilds_str = ",".join(f"{w:.4f}" for w in r["expected_wilds_per_respin"])
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"trig_p={r['trigger_p']:.15e}|"
            f"e_wilds=[{e_wilds_str}]|"
            f"e_pay={r['expected_pay_per_chain_x_bet']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "sticky-wilds-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "sticky_wilds",
        "module": "tools.math_dsl.sticky_wilds",
        "industry_pattern": (
            "NetEnt Sticky Bandits Trail of Blood, Pragmatic Pyramid King, "
            "JTG Wild Bounty Showdown, Quickspin Sticky Bandits, BTG "
            "Bonanza Billion sticky-wild respin chain pattern."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_sticky_wilds_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Closed-form: exact "
            "Markov DP over (wild_count, respin_t) state space using "
            "iterative Binomial PMF construction."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[sticky-wilds-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        last_e = r["expected_wilds_per_respin"][-1]
        print(f"    {r['fixture_name']:32s}  trig_p={r['trigger_p']:.4f}  "
              f"E[W_last]={last_e:.2f}  rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
