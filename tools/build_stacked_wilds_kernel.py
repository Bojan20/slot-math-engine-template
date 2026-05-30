#!/usr/bin/env python3
"""W244 wave 24 — deterministic acceptance for `stacked_wilds`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.stacked_wilds import StackedWildsParams, stacked_wilds_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "STACKED_WILDS_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "mega-moolah-5reel",
        "description": "Microgaming Mega Moolah-style: 5 reels, low p_stacked",
        "params": StackedWildsParams(
            n_reels=5,
            p_stacked_per_reel=0.04,
            pay_per_stacked_count={
                0: 0.0, 1: 0.5, 2: 5.0, 3: 50.0, 4: 500.0, 5: 25000.0,
            },
        ),
    },
    {
        "name": "buffalo-1024ways-5reel",
        "description": "Aristocrat Buffalo: 5 reels, 1024 ways, moderate stacked rate",
        "params": StackedWildsParams(
            n_reels=5,
            p_stacked_per_reel=0.06,
            pay_per_stacked_count={
                0: 0.0, 1: 1.0, 2: 8.0, 3: 80.0, 4: 1000.0, 5: 12500.0,
            },
        ),
    },
    {
        "name": "cleopatra-ii-5reel-classic",
        "description": "IGT Cleopatra II classic: 5 reels, low pay, high frequency",
        "params": StackedWildsParams(
            n_reels=5,
            p_stacked_per_reel=0.08,
            pay_per_stacked_count={
                0: 0.0, 1: 0.3, 2: 3.0, 3: 30.0, 4: 250.0, 5: 5000.0,
            },
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = stacked_wilds_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"n={r['n_reels']}|p={r['p_stacked_per_reel']:.15e}|"
            f"e_k={r['expected_stacked_count']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "stacked-wilds-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "stacked_wilds",
        "module": "tools.math_dsl.stacked_wilds",
        "industry_pattern": (
            "Microgaming Mega Moolah, Aristocrat Buffalo + 1024-ways, "
            "IGT Cleopatra II, NetEnt Twin Spin 243-ways. Per-reel "
            "Bernoulli stacked-wild event with K-fold pay multiplication."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_stacked_wilds_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Closed-form: "
            "Binomial(n_reels, p_stacked_per_reel) × pay_per_stacked_count."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[stacked-wilds-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  n={r['n_reels']}  "
              f"p={r['p_stacked_per_reel']:.3f}  "
              f"E[k]={r['expected_stacked_count']:.3f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
