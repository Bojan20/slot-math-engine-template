#!/usr/bin/env python3
"""W244 wave 18 — deterministic acceptance artefact for `expanding_symbol` FS.

3 canonical fixtures: Book of Dead-like (5×3, rare full-reel), Egyptian
high-volatility (5×3, aggressive expansion), Asian-themed (6×4, more reels).

Output: reports/acceptance/EXPANDING_SYMBOL_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.expanding_symbol import (
    ExpandingSymbolParams,
    expanding_symbol_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "EXPANDING_SYMBOL_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "book-of-dead-like-5x3",
        "description": "Book of Dead-style: 5×3, 10 FS, explorer symbol",
        "params": ExpandingSymbolParams(
            fs_trigger_p=0.0050,    # ~1 in 200 spins
            fs_initial_spins=10,
            reels=5,
            rows=3,
            p_per_cell_in_fs=0.12,  # boosted in FS
            pay_table={3: 1.0, 4: 5.0, 5: 100.0},  # Book-style ladder
            symbol_name="explorer",
        ),
    },
    {
        "name": "egyptian-high-volatility",
        "description": "Aggressive expansion: 5×3, 12 FS, higher p_per_cell",
        "params": ExpandingSymbolParams(
            fs_trigger_p=0.0040,
            fs_initial_spins=12,
            reels=5,
            rows=3,
            p_per_cell_in_fs=0.18,  # aggressive boost
            pay_table={2: 0.5, 3: 2.0, 4: 10.0, 5: 250.0},
            symbol_name="pharaoh",
        ),
    },
    {
        "name": "asian-themed-6x4",
        "description": "6×4 grid (Megaways-adjacent), 8 FS",
        "params": ExpandingSymbolParams(
            fs_trigger_p=0.0060,
            fs_initial_spins=8,
            reels=6,
            rows=4,
            p_per_cell_in_fs=0.10,
            pay_table={3: 0.5, 4: 2.0, 5: 15.0, 6: 200.0},
            symbol_name="dragon",
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = expanding_symbol_rtp(fx["params"])
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
            f"e_pay_spin={r['expected_pay_per_fs_spin']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "expanding-symbol-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "expanding_symbol",
        "module": "tools.math_dsl.expanding_symbol",
        "industry_pattern": (
            "Book of Ra/Book of Dead/Book of Atem/Book of Tut/Book of Demi "
            "Gods expanding-symbol Free Spins pattern. One HP symbol chosen "
            "at FS start expands to fill the reel on any landing, paying "
            "pay-anywhere across rows."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_expanding_symbol_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Closed-form: "
            "Binomial(reels, p_per_reel) PMF × pay_table[k] expectation."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[expanding-symbol-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  trig_p={r['fs_trigger_p']:.4f}  "
              f"e_reels={r['expected_reels_expanded_per_spin']:.3f}  "
              f"rtp={r['rtp_contribution']:.5f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
