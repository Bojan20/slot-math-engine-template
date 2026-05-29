"""W6.3 — Deterministic synthetic timings for mock-mode demo recording.

Real Anthropic calls return wall-clock + token-usage stats. In mock mode
we generate plausible-looking but byte-stable numbers using a hashed seed
derived from `(archetype, prompt)` so two runs of the recorder produce
byte-identical artefacts.
"""

from __future__ import annotations

import hashlib
import random
from dataclasses import dataclass


@dataclass
class MockTiming:
    archetype: str
    wall_clock_ms: int
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int


def _seed(archetype: str, prompt: str) -> int:
    blob = f"slotmath.llm-demo/v1::{archetype}::{prompt}".encode("utf-8")
    return int.from_bytes(hashlib.sha256(blob).digest()[:8], "big")


def synth_timing(archetype: str, prompt: str) -> MockTiming:
    """Deterministic synthetic timing for one prompt.

    Distribution roughly mimics observed Anthropic Claude Sonnet 4.7
    behaviour: 600–1200ms per call, 100–400 input tokens, 200–600 output
    tokens, low cache reads on a first run.
    """
    rng = random.Random(_seed(archetype, prompt))
    return MockTiming(
        archetype=archetype,
        wall_clock_ms=int(rng.uniform(600, 1200)),
        input_tokens=int(rng.uniform(120, 360)),
        output_tokens=int(rng.uniform(220, 540)),
        cache_creation_input_tokens=int(rng.uniform(0, 60)),
        cache_read_input_tokens=int(rng.uniform(0, 100)),
    )
