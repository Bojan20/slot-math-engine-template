"""W6.2 — High-level orchestrator: prompt → (cache | LLM) → GDD YAML.

Glues the leaf modules together:

  1. :func:`tools.gdd_llm_ingest.cache.cache_key` builds the per-prompt
     hash.
  2. :func:`load_cached` returns the entry on hit (no API call).
  3. Otherwise build messages via :mod:`tools.gdd_llm_ingest.prompt`,
     call the injected client, and validate the response.
  4. :func:`save_cached` persists the entry atomically.
  5. :func:`compile_to_gdd_yaml` emits the canonical GDD YAML.

The client is fully injectable — production passes
:class:`AnthropicShim`, tests pass a stub.  When no client is
available AND ``allow_demo_fallback=True`` the orchestrator returns
the bundled canonical demo response for the prompt's archetype (the
shape mocked tests rely on).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from tools.gdd_llm_ingest.cache import (
    cache_key as _cache_key,
    cache_path,
    load_cached,
    save_cached,
)
from tools.gdd_llm_ingest.client import LLMClientProtocol, LLMResponse
from tools.gdd_llm_ingest.compile import (
    GddCompileError,
    compile_to_gdd_yaml,
    validate_llm_payload,
)
from tools.gdd_llm_ingest.demo_prompts import pick_demo_response
from tools.gdd_llm_ingest.prompt import (
    DEFAULT_MODEL,
    SCHEMA_VERSION,
    build_messages,
    build_system,
)
from tools.gdd_llm_ingest.schema import GDD_TOOL_SCHEMA


MAX_TOKENS = 1024
TEMPERATURE = 0.0
TOP_K = 1


@dataclass
class GenerateResult:
    prompt: str
    model: str
    schema_version: str
    payload: dict[str, Any]
    gdd_yaml: str
    cache_key: str
    cache_path: Path
    cache_hit: bool
    used_demo_fallback: bool = False
    usage: dict[str, int] = field(default_factory=dict)


def _tool_definitions() -> list[dict[str, Any]]:
    return [{
        "name": "output_gdd",
        "description": (
            "Emit the structured GDD payload for the brief.  ALWAYS "
            "call this tool exactly once per response."
        ),
        "input_schema": GDD_TOOL_SCHEMA,
    }]


def generate_gdd(
    prompt: str,
    *,
    client: LLMClientProtocol | None = None,
    model: str | None = None,
    use_cache: bool = True,
    cache_dir: Path | None = None,
    allow_demo_fallback: bool = False,
) -> GenerateResult:
    """Run the full prompt → GDD pipeline.

    Parameters
    ----------
    prompt:
        Free-form natural-language game brief.
    client:
        Any object exposing the
        :class:`tools.gdd_llm_ingest.client.LLMClientProtocol`
        interface.  When ``None`` and ``allow_demo_fallback=True`` we
        return the canonical demo response.
    model:
        Override the model id; defaults to ``DEFAULT_MODEL``.
    use_cache:
        When ``True`` (the default) we read + write under
        ``reports/gdd-llm-cache``.  Tests pass a tmpdir to isolate runs.
    cache_dir:
        Override the cache directory.
    allow_demo_fallback:
        When ``True`` and no client is supplied, the orchestrator
        returns the bundled canonical demo response for the prompt's
        archetype (CLI fallback path).
    """
    mdl = model or DEFAULT_MODEL
    key = _cache_key(prompt, mdl, SCHEMA_VERSION)
    out_cache_path = cache_path(key, cache_dir=cache_dir)
    cache_hit = False
    usage: dict[str, int] = {}
    used_demo_fallback = False

    payload: dict[str, Any] | None = None
    cached_entry: dict[str, Any] | None = None
    if use_cache:
        cached_entry = load_cached(key, cache_dir=cache_dir)
        if cached_entry is not None:
            try:
                validate_llm_payload(cached_entry.get("payload") or {})
                payload = cached_entry["payload"]
                cache_hit = True
                usage = dict(cached_entry.get("usage") or {})
            except GddCompileError:
                # Corrupt cache entry — fall through to a fresh call.
                payload = None

    if payload is None:
        if client is None:
            if not allow_demo_fallback:
                raise RuntimeError(
                    "No LLM client provided and demo fallback disabled. "
                    "Pass a client implementing LLMClientProtocol or "
                    "allow_demo_fallback=True."
                )
            payload = dict(pick_demo_response(prompt))
            used_demo_fallback = True
        else:
            messages = build_messages(prompt)
            system = build_system()
            response: LLMResponse = client.messages_create(
                model=mdl,
                system=system,
                messages=messages,
                tools=_tool_definitions(),
                tool_choice={"type": "tool", "name": "output_gdd"},
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                top_k=TOP_K,
            )
            payload = dict(response.tool_use_input or {})
            usage = dict(response.usage or {})

        validate_llm_payload(payload)
        if use_cache:
            save_cached(
                key,
                {
                    "schema": "gdd-llm-cache/v1",
                    "cache_key": key,
                    "model": mdl,
                    "schema_version": SCHEMA_VERSION,
                    "prompt": prompt,
                    "payload": payload,
                    "usage": usage,
                    "used_demo_fallback": used_demo_fallback,
                },
                cache_dir=cache_dir,
            )

    gdd_yaml = compile_to_gdd_yaml(payload)
    return GenerateResult(
        prompt=prompt,
        model=mdl,
        schema_version=SCHEMA_VERSION,
        payload=payload,
        gdd_yaml=gdd_yaml,
        cache_key=key,
        cache_path=out_cache_path,
        cache_hit=cache_hit,
        used_demo_fallback=used_demo_fallback,
        usage=usage,
    )
