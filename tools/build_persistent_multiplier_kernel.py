#!/usr/bin/env python3
"""W244 wave 19 — deterministic acceptance for `persistent_multiplier`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.persistent_multiplier import (
    PersistentMultiplierParams,
    persistent_multiplier_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "PERSISTENT_MULTIPLIER_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "sticky-bandits-uncapped",
        "description": "Quickspin Sticky Bandits style: uncapped escalator over 10 FS",
        "params": PersistentMultiplierParams(
            fs_trigger_p=0.005,
            fs_initial_spins=10,
            base_pay_per_spin_x_bet=0.5,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.3,
            max_multiplier=None,
        ),
    },
    {
        "name": "mighty-wild-capped-5x",
        "description": "Pragmatic Mighty Wild style: cap at 5×, 12 FS",
        "params": PersistentMultiplierParams(
            fs_trigger_p=0.004,
            fs_initial_spins=12,
            base_pay_per_spin_x_bet=0.4,
            initial_multiplier=1.0,
            bump_increment=1.0,
            p_bump_per_spin=0.25,
            max_multiplier=5.0,
        ),
    },
    {
        "name": "money-vault-fs-heavy-cap",
        "description": "NetEnt Money Vault FS: cap=10x, 8 FS, aggressive bump",
        "params": PersistentMultiplierParams(
            fs_trigger_p=0.006,
            fs_initial_spins=8,
            base_pay_per_spin_x_bet=0.6,
            initial_multiplier=2.0,
            bump_increment=2.0,
            p_bump_per_spin=0.45,
            max_multiplier=10.0,
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = persistent_multiplier_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"trig_p={r['fs_trigger_p']:.15e}|"
            f"avg_mult={r['average_multiplier']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "persistent-multiplier-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "persistent_multiplier",
        "module": "tools.math_dsl.persistent_multiplier",
        "industry_pattern": (
            "Quickspin Sticky Bandits, Pragmatic Mighty Wild, NetEnt Money "
            "Vault FS, ELK Bompergo, BTG Extra Chilli mega-multiplier. "
            "Multiplier escalates over FS via per-spin Bernoulli bump."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_persistent_multiplier_kernel`. "
            "Output must match `merkle_root_sha256` exactly. Closed-form: "
            "exact DP over (bump_count, spin) state space, cap-aware."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[persistent-multiplier-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  avg_mult={r['average_multiplier']:.3f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
