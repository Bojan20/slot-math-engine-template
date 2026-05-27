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
from tools.slot_design.composition_planner import (
    plan_composition,
    feature_dictionary,
)
from tools.slot_design.share_aware_lock import share_aware_lock
from tools.slot_design.copilot import (
    apply_mutation,
    list_supported_mutations,
    MutationOp,
    MutationReport,
)

__all__ = [
    "parse_prompt",
    "prompt_to_dsl",
    "plan_composition",
    "feature_dictionary",
    "share_aware_lock",
    "apply_mutation",
    "list_supported_mutations",
    "MutationOp",
    "MutationReport",
    "DetectedFeature",
    "PromptSpec",
]
