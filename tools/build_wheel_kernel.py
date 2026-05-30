#!/usr/bin/env python3
"""W244 wave 16 — deterministic acceptance artefact for `wheel` feature.

Three canonical fixtures: simple credit wheel, multi-tier WAP jackpot
wheel (Wheel of Fortune), spin-again chain wheel (NetEnt Megafortune style).

Output: reports/acceptance/WHEEL_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.wheel import WheelParams, WheelSegment, wheel_rtp

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "WHEEL_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "simple-credit-wheel-10seg",
        "description": "10-segment uniform credit wheel",
        "params": WheelParams(
            trigger_p=0.02,
            segments=(
                WheelSegment("no_win", 4.0, 0.0),
                WheelSegment("credit", 3.0, 10.0),
                WheelSegment("credit", 2.0, 50.0),
                WheelSegment("credit", 1.0, 200.0),
            ),
        ),
    },
    {
        "name": "wap-jackpot-wheel-with-tiers",
        "description": "Wheel of Fortune-style multi-tier jackpot wheel",
        "params": WheelParams(
            trigger_p=0.005,
            segments=(
                WheelSegment("no_win", 50.0, 0.0),
                WheelSegment("credit", 30.0, 25.0),
                WheelSegment("credit", 10.0, 100.0),
                WheelSegment("credit", 5.0, 500.0),
                WheelSegment("jackpot", 4.0, 5_000.0, jackpot_id="major"),
                WheelSegment("jackpot", 1.0, 100_000.0, jackpot_id="grand"),
            ),
        ),
    },
    {
        "name": "spin-again-megafortune-style",
        "description": "Outer wheel: 1/3 spin-again to inner wheel, geometric amortisation",
        "params": WheelParams(
            trigger_p=0.01,
            segments=(
                WheelSegment("credit", 4.0, 20.0),
                WheelSegment("credit", 2.0, 100.0),
                WheelSegment("spin_again", 2.0, 0.0),
                WheelSegment("no_win", 2.0, 0.0),
            ),
            max_spin_again=5,
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = wheel_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"trig_p={r['trigger_p']:.15e}|"
            f"e_award={r['expected_award_per_trigger']:.15e}|"
            f"p_again={r['spin_again_probability']:.15e}|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "wheel-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "wheel",
        "module": "tools.math_dsl.wheel",
        "industry_pattern": (
            "Bonus wheel (IGT Wheel of Fortune, Aristocrat Dragon Cash wheel, "
            "NetEnt Megafortune, all WAP-jackpot wheels). N-segment wheel "
            "with credit / jackpot / spin-again / no-win segments. Spin-again "
            "supports geometric-amortised closed-form via bounded chain cap."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_wheel_kernel`. Output must match "
            "`merkle_root_sha256` exactly. Closed-form: weighted segment "
            "expectation + bounded geometric sum on spin-again chain."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[wheel-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  trig_p={r['trigger_p']:.4f}  "
              f"e_award={r['expected_award_per_trigger']:.2f}  "
              f"p_again={r['spin_again_probability']:.3f}  "
              f"rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
