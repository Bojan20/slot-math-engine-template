#!/usr/bin/env python3
"""W244 wave 17 — deterministic acceptance artefact for `state_machine`.

3 canonical fixtures: classic supermeter (Stakelogic-style), 3-tier
escalation (base/super/mega), mode-switch fury vs base toggle.

Output: reports/acceptance/STATE_MACHINE_KERNEL.json
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tools.math_dsl.state_machine import (
    GameState,
    StateMachineParams,
    state_machine_rtp,
)

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "acceptance" / "STATE_MACHINE_KERNEL.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

FIXTURES = [
    {
        "name": "classic-supermeter-2state",
        "description": "Stakelogic-style supermeter: 1% rare upgrade, 50% drop-back",
        "params": StateMachineParams(
            states=(GameState("base", 0.96), GameState("super", 2.50)),
            transitions=((0.99, 0.01), (0.50, 0.50)),
        ),
    },
    {
        "name": "three-tier-escalation",
        "description": "base/super/mega ladder (Aristocrat Buffalo Stampede style)",
        "params": StateMachineParams(
            states=(
                GameState("base", 0.95),
                GameState("super", 1.10),
                GameState("mega", 2.00),
            ),
            transitions=(
                (0.95, 0.04, 0.01),  # base → mostly stay, rare promote
                (0.50, 0.45, 0.05),  # super → 50% drop, 45% stay, 5% mega
                (0.30, 0.20, 0.50),  # mega → 30% drop to base, 50% stay
            ),
        ),
    },
    {
        "name": "fury-mode-toggle",
        "description": "base / fury 2-state toggle (Pragmatic Power of Thor)",
        "params": StateMachineParams(
            states=(GameState("base", 0.94), GameState("fury", 1.50)),
            transitions=((0.95, 0.05), (0.70, 0.30)),
        ),
    },
]


def main() -> int:
    records = []
    for fx in FIXTURES:
        r = state_machine_rtp(fx["params"])
        records.append({
            "fixture_name": fx["name"],
            "description": fx["description"],
            **r,
        })

    leaf_lines = []
    for r in records:
        pi_str = ",".join(f"{p:.15e}" for p in r["stationary_distribution"])
        leaf_lines.append(
            f"{r['fixture_name']}|"
            f"states={r['states_count']}|"
            f"pi=[{pi_str}]|"
            f"rtp={r['rtp_contribution']:.15e}\n"
        )
    merkle_root = hashlib.sha256("".join(leaf_lines).encode("utf-8")).hexdigest()

    artifact = {
        "schema": "state-machine-kernel/v1",
        "merkle_root_sha256": merkle_root,
        "generated_at_utc": f"deterministic-by-merkle:{merkle_root[:16]}",
        "kernel": "state_machine",
        "module": "tools.math_dsl.state_machine",
        "industry_pattern": (
            "Multi-mode slot state machine (Stakelogic Supermeter, Pragmatic "
            "Power of Thor mode switch, Big Bass Splash multi-mode FS, "
            "Aristocrat Buffalo Stampede tier escalation). Each state has "
            "own per-spin RTP component; transitions follow stochastic matrix."
        ),
        "fixtures_count": len(FIXTURES),
        "records": records,
        "verification": (
            "Re-run `python -m tools.build_state_machine_kernel`. Output must "
            "match `merkle_root_sha256` exactly. Closed-form: stationary "
            "distribution via Gaussian elimination on (P^T - I) with sum=1 "
            "constraint; RTP = π · rtp_components."
        ),
    }
    OUT.write_text(json.dumps(artifact, ensure_ascii=False, indent=2))
    print(f"[state-machine-kernel] wrote {OUT.relative_to(REPO)}")
    print(f"  fixtures:    {len(records)}")
    for r in records:
        pi_short = "/".join(f"{p:.3f}" for p in r["stationary_distribution"])
        print(f"    {r['fixture_name']:32s}  π=[{pi_short}]  rtp={r['rtp_contribution']:.4f}")
    print(f"  merkle root: {merkle_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
