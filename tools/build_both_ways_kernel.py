#!/usr/bin/env python3
"""W244 wave 30 — deterministic acceptance for `both_ways`."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.both_ways import BothWaysParams, both_ways_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "BOTH_WAYS_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "thunderstruck-ii-classic",
        "description": "Microgaming Thunderstruck II both-ways, 70 % line share",
        "params": BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.7),
    },
    {
        "name": "starburst-both-ways",
        "description": "NetEnt Starburst both-ways, 80 % line share (high)",
        "params": BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.8),
    },
    {
        "name": "cleopatra-both-ways-classic",
        "description": "IGT Cleopatra both-ways, 60 % line share (scatter heavy)",
        "params": BothWaysParams(ltr_only_rtp=0.96, line_pay_share=0.6),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = both_ways_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"ltr={r['ltr_only_rtp']:.15e}|"
            f"share={r['line_pay_share']:.15e}|"
            f"mult={r['bidirectional_multiplier']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "both-ways-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "both_ways",
        "module": "tools.math_dsl.both_ways",
        "industry_pattern": (
            "Microgaming Thunderstruck II both-ways, NetEnt Starburst "
            "both-ways, IGT Cleopatra both-ways. Line pays evaluate LTR "
            "+ RTL; scatter/bonus stay flat."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_both_ways_kernel`. Output must "
            "match `merkle_root_sha256` exactly. Closed-form: "
            "RTP = ltr_only_rtp × (1 + line_pay_share). Line component "
            "doubles; scatter/bonus unchanged."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[both-ways-kernel] wrote {OUT.relative_to(REPO)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  ltr={r['ltr_only_rtp']:.3f}  "
              f"share={r['line_pay_share']:.2f}  "
              f"mult={r['bidirectional_multiplier']:.3f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
