"""PHASE 26 — Multi-LLM consensus voting kernel.

Generic harness — accepts a list of LLMProvider callables. Each
provider returns a `LLMReview(provider_name, verdict, confidence,
notes)`. The harness:

  1. Calls every provider with the same prompt (sequentially; future
     async wrapper can parallelise).
  2. Tallies verdicts via majority vote, weighted by confidence.
  3. Returns `ConsensusResult(consensus, agreement, dissent, reviews)`
     where `agreement` is the share of providers voting with the consensus.

Providers are user-supplied callables — no live LLM HTTP code in the
harness, so CI uses mock providers + the same code path runs in prod
with thin wrappers around Claude / GPT / Gemini / Kimi.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol


class LLMProvider(Protocol):
    """A user-supplied callable that reviews a prompt + returns a verdict."""

    def __call__(self, prompt: str) -> "LLMReview":
        ...


@dataclass
class LLMReview:
    provider_name: str
    verdict: str             # e.g. "approve" / "reject" / "needs_review"
    confidence: float        # [0, 1]
    notes: str = ""

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(
                f"confidence {self.confidence} out of [0, 1]"
            )


@dataclass
class ConsensusResult:
    schema_version: str = "urn:slotmath:multi-llm-consensus:v1"
    consensus_verdict: str = ""
    agreement_ratio: float = 0.0
    weighted_score: dict[str, float] = field(default_factory=dict)
    reviews: list[LLMReview] = field(default_factory=list)
    dissent: list[str] = field(default_factory=list)  # provider names
    total_providers: int = 0


def run_consensus(
    providers: list[LLMProvider],
    prompt: str,
    *,
    on_provider_error: str = "skip",   # "skip" | "raise"
) -> ConsensusResult:
    """Call every provider; majority-vote (confidence-weighted) on verdict."""
    if not providers:
        raise ValueError("providers list must be non-empty")
    if on_provider_error not in ("skip", "raise"):
        raise ValueError("on_provider_error must be 'skip' or 'raise'")

    reviews: list[LLMReview] = []
    for prov in providers:
        try:
            r = prov(prompt)
        except Exception:  # noqa: BLE001
            if on_provider_error == "raise":
                raise
            continue
        if not isinstance(r, LLMReview):
            if on_provider_error == "raise":
                raise TypeError(
                    f"provider returned non-LLMReview: {type(r).__name__}"
                )
            continue
        reviews.append(r)

    if not reviews:
        return ConsensusResult(
            consensus_verdict="no_reviews",
            agreement_ratio=0.0,
            reviews=[],
            dissent=[],
            total_providers=0,
        )

    # Confidence-weighted score per verdict
    weighted: dict[str, float] = {}
    for r in reviews:
        weighted[r.verdict] = weighted.get(r.verdict, 0.0) + r.confidence
    consensus_verdict = max(weighted, key=weighted.get)
    consensus_weight = weighted[consensus_verdict]
    total_weight = sum(weighted.values()) or 1.0
    agreement = consensus_weight / total_weight
    dissent = [r.provider_name for r in reviews if r.verdict != consensus_verdict]

    return ConsensusResult(
        consensus_verdict=consensus_verdict,
        agreement_ratio=round(agreement, 4),
        weighted_score={k: round(v, 4) for k, v in weighted.items()},
        reviews=list(reviews),
        dissent=dissent,
        total_providers=len(reviews),
    )
