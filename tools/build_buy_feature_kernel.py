#!/usr/bin/env python3
"""W244 wave 15 — deterministic acceptance artefact for `buy_feature`.

5 canonical buy-feature fixtures covering common BTG/Pragmatic/Push/Nolimit
patterns. Each fixture audits buy RTP, fair cost, jurisdiction passes
(UKGC RTS 13C @ 0.5/1.0 pp tolerance, MGA RG 2021/02 @ 0.96/0.97 ceiling).

Output: reports/acceptance/BUY_FEATURE_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.buy_feature import BuyFeatureParams, buy_feature_audit

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "BUY_FEATURE_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "fair-buy-base-rtp-match",
        "description": "buy RTP exactly equals base game RTP (regulator default)",
        "params": BuyFeatureParams(96.0, 100.0, 0.96, target_buy_rtp=0.96),
    },
    {
        "name": "btg-bonus-buy-100x",
        "description": "BTG Bonus Buy at 100× bet, slight buyer-side edge",
        "params": BuyFeatureParams(96.5, 100.0, 0.96, target_buy_rtp=0.96),
    },
    {
        "name": "pragmatic-buy-feature-cheap",
        "description": "cheap buy at 50× — bonus RTP higher than buy cost",
        "params": BuyFeatureParams(50.5, 50.0, 0.96, target_buy_rtp=0.96),
    },
    {
        "name": "ukgc-rts13c-near-limit",
        "description": "RTS 13C +0.4 pp delta — within tolerance",
        "params": BuyFeatureParams(96.4, 100.0, 0.96, target_buy_rtp=0.96),
    },
    {
        "name": "mga-2021-02-fails",
        "description": "buy RTP 97 % — fails MGA 0.96 ceiling",
        "params": BuyFeatureParams(97.0, 100.0, 0.96, target_buy_rtp=0.96),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        audit = buy_feature_audit(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **audit,
        })

    leaf_lines = []
    for r in records:
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"buy_rtp={r['buy_rtp']:.15e}|"
            f"delta={r['delta_pp_vs_base']:.15e}|"
            f"ukgc={r['ukgc_rts13c_pass_0p5']}|"
            f"mga={r['mga_2021_02_pass_0p96']}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "buy-feature-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "buy_feature",
        "module": "tools.math_dsl.buy_feature",
        "industry_pattern": (
            "BTG Bonus Buy / Pragmatic Buy Feature / Hacksaw all-buy / Push "
            "Gaming Bonus Buy / Nolimit City Feature Buy. Player pays "
            "buy_cost_x_bet × bet to immediately enter bonus. Regulator "
            "contract: UKGC RTS 13C (buy_rtp delta ≤ 0.5 pp vs base) + "
            "MGA RG 2021/02 (buy_rtp ≤ 0.96 ceiling) + disclosure UI."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_buy_feature_kernel`. Output "
            "must match `merkle_root_sha256` exactly. Closed-form: "
            "buy_rtp = bonus_pay/cost, fair_cost = bonus_pay/target_rtp, "
            "delta_pp = (buy_rtp - base_rtp) × 100."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[buy-feature-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        print(f"    {r['fixture_name']:32s}  buy_rtp={r['buy_rtp']:.4f}  "
              f"Δ={r['delta_pp_vs_base']:+.2f}pp  "
              f"ukgc={r['ukgc_rts13c_pass_0p5']}  mga={r['mga_2021_02_pass_0p96']}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
