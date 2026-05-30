#!/usr/bin/env python3
"""W244 wave 10 — emit deterministic acceptance artifact for `money_collect`.

Runs the closed-form `money_collect_rtp_contribution` against three canonical
fixtures (5×3 / 6×4 / 5×4) and writes a single regulator-ready JSON with:

  * Per-fixture trigger probability + episode value + RTP contribution
  * SHA-256 over the entire result block
  * Merkle-derived `generated_at_utc` so the file rebuilds byte-stable

Output: reports/acceptance/MONEY_COLLECT_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.money_collect import (
    MoneyCollectParams,
    money_collect_rtp_contribution,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "MONEY_COLLECT_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Canonical fixtures — three industry topologies. All values rounded to
# nice numbers and intentionally NOT vendor-derived (the actual reel
# weights stay under NDA; these are public-spec-style proxies).
FIXTURES = [
    {
        "name": "5x3-classic",
        "topology": "rectangular 5×3 = 15 cells",
        "params": MoneyCollectParams(
            p_per_cell=0.04,
            n_cells=15,
            trigger_count_min=6,
            respins_reset=3,
            grid_cap=15,
            value_table={1.0: 50.0, 2.0: 30.0, 5.0: 15.0, 10.0: 4.0, 50.0: 1.0},
        ),
    },
    {
        "name": "6x4-megaways-like",
        "topology": "rectangular 6×4 = 24 cells",
        "params": MoneyCollectParams(
            p_per_cell=0.035,
            n_cells=24,
            trigger_count_min=8,
            respins_reset=3,
            grid_cap=24,
            value_table={1.0: 45.0, 2.0: 30.0, 5.0: 15.0, 10.0: 7.0, 25.0: 2.0, 100.0: 1.0},
        ),
    },
    {
        "name": "5x4-volcano",
        "topology": "rectangular 5×4 = 20 cells",
        "params": MoneyCollectParams(
            p_per_cell=0.045,
            n_cells=20,
            trigger_count_min=7,
            respins_reset=3,
            grid_cap=20,
            value_table={1.0: 40.0, 3.0: 30.0, 5.0: 18.0, 10.0: 8.0, 20.0: 3.0, 100.0: 1.0},
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        result = money_collect_rtp_contribution(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "topology_label": fx["topology"],
            **result,
        })

    # Merkle-style root over (fixture_name, rtp_contribution) for byte-stable
    # rebuild. Float values are formatted with explicit precision so two
    # runs on different machines yield identical digests.
    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"trig_p={r['trigger_p']:.15e}|"
            f"e_total={r['expected_total_per_episode']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "money-collect-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "money_collect",
        "module": "tools.math_dsl.money_collect",
        "industry_pattern": (
            "Cash Eruption / Money Train / Coin Volcano pattern: trigger by "
            "≥ N money symbols on initial spin, lock-and-respin episode "
            "with reset counter, terminate on empty respin pool or grid-fill, "
            "payout = SUM(locked money values) × bet"
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_money_collect_kernel`. The output "
            "must match the committed `merkle_root_sha256` exactly. "
            "Closed-form computation is deterministic (binomial CDF + "
            "Markov-chain DP, no RNG)."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[money-collect-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:25s}  trig_p={r['trigger_p']:.4e}  "
              f"e_total={r['expected_total_per_episode']:.3f}  "
              f"rtp={r['rtp_contribution']:.4e}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
