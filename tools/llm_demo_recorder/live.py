"""W6.3 — Real Anthropic call wrapper.

Delegates to :mod:`tools.gdd_llm_ingest` for the actual API call so the
demo recorder is a thin instrumentation layer.  Used only when
``--live`` is set AND ``ANTHROPIC_API_KEY`` is present in the
environment; otherwise the CLI prints a warning and falls back to mock
mode.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass


@dataclass
class LiveTiming:
    archetype: str
    wall_clock_ms: int
    input_tokens: int
    output_tokens: int
    cache_creation_input_tokens: int
    cache_read_input_tokens: int
    model: str
    gdd_yaml: str
    gdd_sha256: str


def have_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def run_live_prompt(archetype: str, prompt: str) -> LiveTiming | None:
    """Make one real Anthropic call.

    Returns ``None`` if the API key is missing or the SDK is unavailable.
    """
    if not have_api_key():
        return None
    try:
        from tools.gdd_llm_ingest.client import build_default_client
        from tools.gdd_llm_ingest.ingest import generate_gdd
    except Exception:  # noqa: BLE001
        return None

    client = build_default_client()
    if client is None:
        return None

    import hashlib

    start = time.perf_counter()
    try:
        res = generate_gdd(prompt, client=client, use_cache=False)
    except Exception:  # noqa: BLE001
        return None
    wall_ms = int((time.perf_counter() - start) * 1000.0)

    yaml = res.gdd_yaml
    sha = hashlib.sha256(yaml.encode("utf-8")).hexdigest()
    usage = res.usage or {}
    return LiveTiming(
        archetype=archetype,
        wall_clock_ms=wall_ms,
        input_tokens=int(usage.get("input_tokens", 0)),
        output_tokens=int(usage.get("output_tokens", 0)),
        cache_creation_input_tokens=int(usage.get("cache_creation_input_tokens", 0)),
        cache_read_input_tokens=int(usage.get("cache_read_input_tokens", 0)),
        model=res.model,
        gdd_yaml=yaml,
        gdd_sha256=sha,
    )
