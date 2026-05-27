"""PHASE 10 — AI Math Compiler v2.

`slot-design` CLI: natural-language game spec → fully-cert-ready IR + Studio
scaffold + signed cert ZIP. Composes:

    Phase 4 GDD pipeline (DSL synthesizer + SMT-locked RTP)
    Phase 6 Z3 closed-form solver
    Phase 8 local-agent domain corpus (for LLM-assisted prompt expansion)
    Phase 9 tournament-mode overlay (optional)

Public API:

    from tools.slot_design import (
        parse_prompt,            # NL prompt → structured spec dict
        prompt_to_dsl,           # structured spec → DSL TOML-shaped dict
        build_game_from_prompt,  # full prompt → IR JSON pipeline
    )

CLI:

    python -m tools.slot_design "5×3 Vendor B-style FS + HoldAndWin" \\
                                --target-rtp 0.965 --out games/my-game/

Host-orchestrator-agnostic — no host-specific imports. Optional LLM provider
shim activates only via `LLM_PROVIDER_CMD` env (defaults: pure deterministic
heuristic parser; clean-room reproducibility for CI / regulators).
"""

from __future__ import annotations

from tools.slot_design.prompt_parser import (
    parse_prompt,
    prompt_to_dsl,
    DetectedFeature,
    PromptSpec,
)

__all__ = [
    "parse_prompt",
    "prompt_to_dsl",
    "DetectedFeature",
    "PromptSpec",
]
