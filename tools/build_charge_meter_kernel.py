#!/usr/bin/env python3
"""W244 wave 11 — deterministic acceptance artefact for `charge_meter`.

Three canonical fixtures (single-tier Starburst-like, 3-tier multi-meter,
and dense-fast-meter Money Cart pattern). All values are public-spec
proxies — vendor reel weights stay under NDA.

Output: reports/acceptance/CHARGE_METER_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.charge_meter import (
    ChargeMeterParams,
    ChargeTier,
    charge_meter_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "CHARGE_METER_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "single-tier-starburst-like",
        "description": "single-meter, mid-frequency feature trigger",
        "params": ChargeMeterParams(
            expected_charge_per_spin=0.5,
            tiers=(ChargeTier("classic", threshold=50.0, award_value_x_bet=10.0),),
        ),
    },
    {
        "name": "three-tier-multi-meter",
        "description": "small/medium/grand tier ladder (Pragmatic Power Stacks style)",
        "params": ChargeMeterParams(
            expected_charge_per_spin=1.0,
            tiers=(
                ChargeTier("small", threshold=20.0, award_value_x_bet=4.0),
                ChargeTier("medium", threshold=100.0, award_value_x_bet=30.0),
                ChargeTier("grand", threshold=1000.0, award_value_x_bet=500.0),
            ),
        ),
    },
    {
        "name": "money-cart-dense-fast",
        "description": "dense-fast meter — high charge rate, low threshold, frequent trigger",
        "params": ChargeMeterParams(
            expected_charge_per_spin=2.0,
            tiers=(
                ChargeTier("base-cart", threshold=10.0, award_value_x_bet=1.5),
                ChargeTier("super-cart", threshold=50.0, award_value_x_bet=12.0),
            ),
            persistent_across_sessions=False,
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = charge_meter_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"e_charge={r['expected_charge_per_spin']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "charge-meter-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "charge_meter",
        "module": "tools.math_dsl.charge_meter",
        "industry_pattern": (
            "Starburst-meter / Power Stacks / Money Cart meter mode: per-spin "
            "charge accumulates into a meter; reaching threshold fires award "
            "(credit / multiplier / free spin / feature token). Multi-tier "
            "ladders sum independently."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_charge_meter_kernel`. Output must "
            "match `merkle_root_sha256` exactly. Closed-form: Wald identity "
            "RTP[tier] = (E[charge]/threshold) × award; no RNG."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[charge-meter-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:30s}  e_charge={r['expected_charge_per_spin']:.3f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
