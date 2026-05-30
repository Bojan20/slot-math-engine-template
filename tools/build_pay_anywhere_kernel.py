#!/usr/bin/env python3
"""W244 wave 26 — deterministic acceptance for `pay_anywhere`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.pay_anywhere import PayAnywhereParams, pay_anywhere_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "PAY_ANYWHERE_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "sweet-bonanza-scatter-6x5",
        "description": "Pragmatic Sweet Bonanza scatter trigger 8+ symbols",
        "params": PayAnywhereParams(
            n_cells=30, p_per_cell=0.07,
            pay_table={8: 5.0, 10: 20.0, 12: 100.0, 14: 500.0},
            min_pay_count=8, symbol_name="scatter",
        ),
    },
    {
        "name": "gonzo-quest-fall-symbol",
        "description": "NetEnt Gonzo's Quest pay-anywhere on cascade",
        "params": PayAnywhereParams(
            n_cells=15, p_per_cell=0.12,
            pay_table={3: 0.5, 4: 2.0, 5: 10.0, 6: 50.0, 7: 250.0},
            min_pay_count=3, symbol_name="gonzo",
        ),
    },
    {
        "name": "wolf-gold-money-anywhere",
        "description": "Pragmatic Wolf Gold money-symbol pay-anywhere",
        "params": PayAnywhereParams(
            n_cells=15, p_per_cell=0.08,
            pay_table={6: 1.0, 7: 3.0, 8: 8.0, 10: 50.0, 12: 200.0, 15: 1500.0},
            min_pay_count=6, symbol_name="money",
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = pay_anywhere_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"n={r['n_cells']}|p={r['p_per_cell']:.15e}|"
            f"min_k={r['min_pay_count']}|"
            f"e_k={r['expected_landings']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "pay-anywhere-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "pay_anywhere",
        "module": "tools.math_dsl.pay_anywhere",
        "industry_pattern": (
            "Pragmatic Sweet Bonanza scatter trigger, NetEnt Gonzo's Quest "
            "pay-anywhere, Pragmatic Wolf Gold money-symbol anywhere. "
            "Binomial(n_cells, p_per_cell) landings × pay_table[K] "
            "with min_pay_count threshold."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_pay_anywhere_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Closed-form: pure "
            "Binomial PMF aggregation × operator-supplied pay table."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[pay-anywhere-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  n={r['n_cells']}  "
              f"p={r['p_per_cell']:.3f}  E[K]={r['expected_landings']:.2f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
