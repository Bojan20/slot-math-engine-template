#!/usr/bin/env python3
"""W244 wave 31 — deterministic acceptance for `asymmetric_paytable`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.asymmetric_paytable import (
    AsymmetricPaytableParams,
    asymmetric_paytable_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "ASYMMETRIC_PAYTABLE_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "twin-spin-asymmetric-reels",
        "description": "NetEnt Twin Spin asymmetric reels (twin/triple/quad/quint columns)",
        "params": AsymmetricPaytableParams(
            per_symbol_contributions={
                "hp1": {"twin": 0.05, "triple": 0.10, "quad": 0.08, "quint": 0.04},
                "hp2": {"twin": 0.04, "triple": 0.08, "quad": 0.06, "quint": 0.03},
                "lp1": {"twin": 0.10, "triple": 0.06, "quad": 0.03, "quint": 0.01},
                "lp2": {"twin": 0.12, "triple": 0.05, "quad": 0.02, "quint": 0.005},
            },
        ),
    },
    {
        "name": "wild-west-gold-asymmetric",
        "description": "Pragmatic Wild West Gold asymmetric pay scaling",
        "params": AsymmetricPaytableParams(
            per_symbol_contributions={
                "sheriff": {"left_3": 0.04, "left_4": 0.08, "left_5": 0.20},
                "cowboy":  {"left_3": 0.06, "left_4": 0.10, "left_5": 0.18},
                "horse":   {"left_3": 0.08, "left_4": 0.10, "left_5": 0.12},
                "ace":     {"left_3": 0.15, "left_4": 0.10, "left_5": 0.05},
            },
        ),
    },
    {
        "name": "wild-toro-asymmetric-stacks",
        "description": "ELK Wild Toro asymmetric stack pays",
        "params": AsymmetricPaytableParams(
            per_symbol_contributions={
                "toro":  {"single": 0.05, "stack_2": 0.10, "stack_3": 0.15},
                "matador": {"single": 0.08, "stack_2": 0.06, "stack_3": 0.04},
                "ribbon":  {"single": 0.12, "stack_2": 0.04, "stack_3": 0.02},
            },
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = asymmetric_paytable_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"symbols={r['symbols_count']}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "asymmetric-paytable-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "asymmetric_paytable",
        "module": "tools.math_dsl.asymmetric_paytable",
        "industry_pattern": (
            "NetEnt Twin Spin asymmetric reels, Pragmatic Wild West Gold "
            "asymmetric pay scaling, ELK Wild Toro asymmetric stacks. "
            "Per-symbol pay depends on reel-set shape (not just k-of-a-kind)."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_asymmetric_paytable_kernel`. "
            "Output must match `merkle_root_sha256` exactly. Kernel "
            "aggregates operator-supplied per-symbol-per-shape "
            "contributions (sourced from validated PAR data)."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[asymmetric-paytable-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:35s}  symbols={r['symbols_count']}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
