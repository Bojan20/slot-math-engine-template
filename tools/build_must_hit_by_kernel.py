#!/usr/bin/env python3
"""W244 wave 12 — deterministic acceptance artefact for `must_hit_by` jackpots.

Three canonical fixtures: 2-pot mystery, 4-tier mini/minor/major/grand
ladder, single-pot guaranteed-strike. All values are public-spec proxies
— actual vendor pot ladders stay under NDA.

Output: reports/acceptance/MUST_HIT_BY_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.must_hit_by import (
    MustHitByParams,
    MustHitByPot,
    must_hit_by_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "MUST_HIT_BY_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "two-pot-mystery",
        "description": "two-pot mystery — mini + major",
        "params": MustHitByParams(pots=(
            MustHitByPot("mini",  10,   0.001, 100,    p_strike_per_spin=0.0001),
            MustHitByPot("major", 500,  0.003, 5_000,  p_strike_per_spin=1e-6),
        )),
    },
    {
        "name": "four-tier-ladder",
        "description": "mini/minor/major/grand ladder (Lightning Link style)",
        "params": MustHitByParams(pots=(
            MustHitByPot("mini",  10,     0.0005, 100,     p_strike_per_spin=1e-4),
            MustHitByPot("minor", 50,     0.001,  500,     p_strike_per_spin=1e-5),
            MustHitByPot("major", 500,    0.002,  5_000,   p_strike_per_spin=1e-6),
            MustHitByPot("grand", 10_000, 0.005,  100_000, p_strike_per_spin=1e-7),
        )),
    },
    {
        "name": "single-pot-guaranteed",
        "description": "single high-cap pot, p_strike=0 (always forced)",
        "params": MustHitByParams(pots=(
            MustHitByPot("grand-only", 1_000, 0.01, 100_000, p_strike_per_spin=0.0),
        )),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = must_hit_by_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"rtp={r['rtp_contribution']:.15e}|"
            f"pots={len(r['pots'])}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "must-hit-by-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "must_hit_by",
        "module": "tools.math_dsl.must_hit_by",
        "industry_pattern": (
            "Mystery / 'Must Hit By' jackpot (NGCB Reg 14.040, IGT Lightning "
            "Link, Aristocrat Dragon Link, Scientific Games Dollar Storm). "
            "Pot seeded at `seed_x_bet`, grows by `contribution_x` per bet, "
            "guaranteed strike at `must_hit_by_x_bet` cap."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_must_hit_by_kernel`. Output must "
            "match `merkle_root_sha256` exactly. Closed-form: conservation "
            "argument (RTP[pot] = contribution_x), expected strike value via "
            "geometric arrival truncated at cap."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[must-hit-by-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:30s}  rtp={r['rtp_contribution']:.4f}  pots={len(r['pots'])}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
