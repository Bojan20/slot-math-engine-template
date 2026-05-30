#!/usr/bin/env python3
"""W244 wave 20 — deterministic acceptance for `cascade` (tumble)."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.cascade import CascadeParams, cascade_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "CASCADE_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "sweet-bonanza-style",
        "description": "Pragmatic Sweet Bonanza cascade: medium-frequency, mild mult ramp",
        "params": CascadeParams(
            p_initial_win=0.27,
            base_pay_per_cascade_x_bet=0.3,
            p_win_per_cascade=0.40,
            multiplier_ladder=(1.0, 1.0, 2.0, 2.0, 5.0, 5.0, 25.0, 25.0),
            max_chain=8,
        ),
    },
    {
        "name": "money-train-aggressive",
        "description": "Relax Money Train cascade: high mult ramp, frequent cascades",
        "params": CascadeParams(
            p_initial_win=0.30,
            base_pay_per_cascade_x_bet=0.4,
            p_win_per_cascade=0.50,
            multiplier_ladder=(1.0, 2.0, 4.0, 8.0, 16.0, 32.0, 64.0, 128.0),
            max_chain=8,
        ),
    },
    {
        "name": "reactoonz-style",
        "description": "Play'n GO Reactoonz: cluster cascade with charge meter",
        "params": CascadeParams(
            p_initial_win=0.20,
            base_pay_per_cascade_x_bet=0.25,
            p_win_per_cascade=0.35,
            multiplier_ladder=(1.0, 2.0, 3.0, 4.0, 6.0, 8.0, 10.0, 12.0, 16.0, 20.0),
            max_chain=10,
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = cascade_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"p_init={r['p_initial_win']:.15e}|"
            f"e_chain={r['expected_chain_length']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "cascade-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "cascade",
        "module": "tools.math_dsl.cascade",
        "industry_pattern": (
            "Pragmatic Sweet Bonanza, Relax Money Train, Play'n GO Reactoonz, "
            "BTG Bonanza tumble/avalanche/cascade. Winning symbols disappear, "
            "remaining fall, new drop from top. Multiplier ramps per step."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_cascade_kernel`. Output must match "
            "`merkle_root_sha256` exactly. Closed-form: bounded geometric "
            "chain sum × multiplier_ladder per-step weighting."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[cascade-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  p_init={r['p_initial_win']:.3f}  "
              f"e_chain={r['expected_chain_length']:.2f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
