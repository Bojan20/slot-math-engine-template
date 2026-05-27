"""PHASE 26 — Multi-LLM Math Cross-Check Consensus.

Generic consensus voting harness: accepts a list of `LLMProvider`
callables (each returns a structured `LLMReview` for a given IR /
design prompt) + computes consensus + flags divergences.

Pure-Python; LLM providers are user-supplied callables, so the harness
is dependency-free + deterministic for CI (use mock providers).

Public API:
    from tools.multi_llm import (
        LLMProvider,
        LLMReview,
        ConsensusResult,
        run_consensus,
    )
"""

from __future__ import annotations

from tools.multi_llm.consensus import (
    LLMProvider,
    LLMReview,
    ConsensusResult,
    run_consensus,
)

__all__ = ["LLMProvider", "LLMReview", "ConsensusResult", "run_consensus"]
