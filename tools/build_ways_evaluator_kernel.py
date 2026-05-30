#!/usr/bin/env python3
"""W244 wave 25 — deterministic acceptance for `ways_evaluator`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.ways_evaluator import (
    WaysEvaluatorParams,
    ways_evaluator_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "WAYS_EVALUATOR_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# Uniform Megaways distribution (rows 2-7 each with prob 1/6)
MEGAWAYS_UNIFORM = {r: 1.0 / 6 for r in range(2, 8)}

FIXTURES = [
    {
        "name": "classic-243-ways-5x3",
        "description": "Microgaming 243-ways: 5 reels × 3 rows (fixed)",
        "params": WaysEvaluatorParams(
            row_distribution_per_reel=tuple({3: 1.0} for _ in range(5)),
            per_way_rtp_x_bet=0.96 / 243,
        ),
    },
    {
        "name": "buffalo-1024-ways-5x4",
        "description": "Aristocrat Buffalo 1024 ways: 5 reels × 4 rows",
        "params": WaysEvaluatorParams(
            row_distribution_per_reel=tuple({4: 1.0} for _ in range(5)),
            per_way_rtp_x_bet=0.96 / 1024,
        ),
    },
    {
        "name": "btg-megaways-bonanza-6reel",
        "description": "BTG Megaways Bonanza: 6 reels × variable 2-7 rows",
        "params": WaysEvaluatorParams(
            row_distribution_per_reel=tuple([MEGAWAYS_UNIFORM] * 6),
            per_way_rtp_x_bet=0.96 / (4.5 ** 6),
        ),
    },
    {
        "name": "btg-megaways-117649-max",
        "description": "BTG Megaways max state: 6 reels × 7 rows = 117649 ways",
        "params": WaysEvaluatorParams(
            row_distribution_per_reel=tuple({7: 1.0} for _ in range(6)),
            per_way_rtp_x_bet=0.96 / 117649,
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = ways_evaluator_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"n_reels={r['n_reels']}|"
            f"e_ways={r['expected_ways_count']:.15e}|"
            f"per_way={r['per_way_rtp_x_bet']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "ways-evaluator-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "ways_evaluator",
        "module": "tools.math_dsl.ways_evaluator",
        "industry_pattern": (
            "Microgaming 243/1024-ways, Aristocrat Buffalo 1024-ways, "
            "BTG Megaways (Bonanza, Extra Chilli, White Rabbit), "
            "Pragmatic Big Bass Splash 4096-ways. Variable-rows or fixed "
            "topology with ways_count = product(row_count_per_reel)."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_ways_evaluator_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Closed-form: "
            "product over reels of E[row_count_per_reel] under independent "
            "reels assumption × per_way_rtp_x_bet."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[ways-evaluator-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:30s}  n={r['n_reels']}  "
              f"E[ways]={r['expected_ways_count']:.1f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
