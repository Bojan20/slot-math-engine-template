#!/usr/bin/env python3
"""W244 wave 13 — deterministic acceptance artefact for `pick_chain`.

Three canonical fixtures: 2-level bronze/silver, 3-level mighty-cash
style, single-level credit-only spin. All values public-spec proxies.

Output: reports/acceptance/PICK_CHAIN_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.pick_chain import PickChainParams, PickLevel, pick_chain_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "PICK_CHAIN_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "two-level-bronze-silver",
        "description": "bronze (12-pool) → silver (8-pool) chain",
        "params": PickChainParams(
            trigger_p=0.02,
            levels=(
                PickLevel("bronze", 12, {1.0: 4, 2.0: 2, 0.0: 3, -1.0: 3}),
                PickLevel("silver", 8, {5.0: 4, 10.0: 2, 0.0: 1, -1.0: 1}),
            ),
        ),
    },
    {
        "name": "three-level-mighty-cash",
        "description": "bronze/silver/gold (Mighty Cash pattern)",
        "params": PickChainParams(
            trigger_p=0.01,
            levels=(
                PickLevel("bronze", 12, {1.0: 4, 2.0: 2, 0.0: 3, -1.0: 3}),
                PickLevel("silver", 8, {5.0: 4, 10.0: 2, 0.0: 1, -1.0: 1}),
                PickLevel("gold", 6, {50.0: 4, 100.0: 2}),
            ),
        ),
    },
    {
        "name": "single-level-credit-only",
        "description": "single pick screen, all credit awards (no chain)",
        "params": PickChainParams(
            trigger_p=0.03,
            levels=(PickLevel("only", 6, {2.0: 4, 5.0: 2}),),
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = pick_chain_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"trig_p={r['trigger_p']:.15e}|"
            f"e_total={r['expected_total_award_x_bet']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "pick-chain-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "pick_chain",
        "module": "tools.math_dsl.pick_chain",
        "industry_pattern": (
            "Multi-level pick bonus (Microgaming Mega Moolah pick-pot, "
            "Aristocrat Mighty Cash, NetEnt Hall of Spins). Player picks "
            "from N-option pool revealing credit / advance / end tokens. "
            "Multi-tier ladders escalate per-pick award size."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_pick_chain_kernel`. Output must "
            "match `merkle_root_sha256` exactly. Closed-form: first-order "
            "statistic on uniform end-token placement, level-advance via "
            "relative odds (advance / (advance + end))."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[pick-chain-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:30s}  trig_p={r['trigger_p']:.4f}  "
              f"e_total={r['expected_total_award_x_bet']:.3f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
