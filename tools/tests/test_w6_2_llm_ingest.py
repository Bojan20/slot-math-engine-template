"""W6.2 — LLM-assisted NL → GDD ingest acceptance suite.

Six tests, every one of them runs offline against a mocked Anthropic
client.  Real-API calls are gated behind ``ANTHROPIC_API_KEY`` so CI
without the env var still passes 6 / 6.

Coverage:
  1. test_llm_response_validates       — mocked LLM JSON passes schema.
  2. test_compile_to_gdd_deterministic — same JSON => bit-identical YAML.
  3. test_5_archetype_prompts_compile  — 5 demo archetypes each pass
                                         parse_spec.
  4. test_cache_hit_skips_api          — second call returns the cached
                                         payload without re-invoking the
                                         mock client.
  5. test_missing_api_key_falls_back   — CLI prints the fallback line +
                                         shells out to W6.1.
  6. test_pipeline_e2e_on_llm_gdd      — full W5.7 pipeline on the
                                         mocked GDD, asserts all four
                                         acceptance gates PASS.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.gdd_llm_ingest import (
    LLMResponse,
    compile_to_gdd_yaml,
    generate_gdd,
    load_cached,
    validate_llm_payload,
)
from tools.gdd_llm_ingest.demo_prompts import DEMO_PROMPTS, DEMO_RESPONSES
from tools.gdd_llm_ingest.prompt import DEFAULT_MODEL, SCHEMA_VERSION
from tools.greenfield_demo.pipeline import (
    ENGINE_BIN,
    run_pipeline,
)
from tools.math_dsl.spec import parse_spec


REPO = Path(__file__).resolve().parents[2]


# ─── Mock client helpers ────────────────────────────────────────────────


class _MockClient:
    """Minimal LLMClientProtocol stub.

    Returns the canonical demo payload for the archetype implied by the
    last user prompt.  Records call_count + last_kwargs for assertions.
    """

    def __init__(self, payload: dict | None = None) -> None:
        self.payload = payload
        self.call_count = 0
        self.last_kwargs: dict | None = None

    def messages_create(self, **kwargs):
        self.call_count += 1
        self.last_kwargs = kwargs
        if self.payload is not None:
            chosen = self.payload
        else:
            # Pick a canonical demo response based on the trailing user
            # prompt text.
            messages = kwargs.get("messages") or []
            text = ""
            if messages:
                last = messages[-1]
                for c in last.get("content") or []:
                    if c.get("type") == "text":
                        text = c.get("text", "")
                        break
            text_low = text.lower()
            if "hold" in text_low and "win" in text_low:
                chosen = DEMO_RESPONSES["hold_and_win"]
            elif "megaways" in text_low:
                chosen = DEMO_RESPONSES["megaways"]
            elif "cascade" in text_low:
                chosen = DEMO_RESPONSES["cascade"]
            elif "ways" in text_low:
                chosen = DEMO_RESPONSES["ways"]
            else:
                chosen = DEMO_RESPONSES["lines"]
        return LLMResponse(
            tool_use_input=dict(chosen),
            stop_reason="tool_use",
            model=kwargs.get("model", "mock-model"),
            usage={"input_tokens": 320, "output_tokens": 160,
                   "cache_creation_input_tokens": 0,
                   "cache_read_input_tokens": 0},
        )


# ─── 1. Schema validation ────────────────────────────────────────────────


def test_llm_response_validates():
    """Every bundled demo response is schema-valid out of the box."""
    for arch, payload in DEMO_RESPONSES.items():
        # validate_llm_payload raises on failure; calling = green path.
        validate_llm_payload(payload)
        # And drives compile_to_gdd_yaml without error.
        yaml_text = compile_to_gdd_yaml(payload)
        assert "schema_version" in yaml_text
        spec = parse_spec(yaml_text)
        assert spec.meta.get("name") == payload["name"], arch


# ─── 2. Determinism ─────────────────────────────────────────────────────


def test_compile_to_gdd_deterministic(tmp_path):
    """Same prompt + same client => bit-identical GDD YAML.

    Runs ``generate_gdd`` twice into separate tmp cache dirs so the
    second call is NOT a cache hit, then asserts byte-equality of the
    emitted YAMLs.
    """
    prompt = DEMO_PROMPTS["hold_and_win"]
    cache_a = tmp_path / "cache-a"
    cache_b = tmp_path / "cache-b"
    client_a = _MockClient()
    client_b = _MockClient()
    r1 = generate_gdd(prompt, client=client_a, cache_dir=cache_a)
    r2 = generate_gdd(prompt, client=client_b, cache_dir=cache_b)
    assert r1.cache_hit is False
    assert r2.cache_hit is False
    assert r1.gdd_yaml == r2.gdd_yaml, (
        "non-deterministic GDD YAML between two fresh calls"
    )
    # JSON payloads also byte-stable when canonically dumped.
    assert json.dumps(r1.payload, sort_keys=True) == json.dumps(
        r2.payload, sort_keys=True
    )
    assert r1.cache_key == r2.cache_key


# ─── 3. Five archetypes ─────────────────────────────────────────────────


def test_5_archetype_prompts_compile(tmp_path):
    """Each of the 5 bundled archetype prompts compiles through the
    full mock-client path and the resulting GDD validates."""
    for arch, prompt in DEMO_PROMPTS.items():
        client = _MockClient()
        res = generate_gdd(
            prompt,
            client=client,
            cache_dir=tmp_path / f"cache-{arch}",
        )
        assert res.payload["archetype"] == arch, (
            f"mocked response for {arch!r} returned "
            f"archetype={res.payload['archetype']!r}"
        )
        # GDD parses cleanly via the math_dsl grammar.
        spec = parse_spec(res.gdd_yaml)
        assert spec.meta.get("name") == res.payload["name"]
        # Topology kind matches the archetype family.
        if arch == "megaways":
            assert spec.topology.kind == "variable_rows"
        else:
            assert spec.topology.kind == "rectangular"
        # The archetype-defining feature is present for H&W / cascade.
        feat_kinds = {f.kind for f in spec.features}
        if arch == "hold_and_win":
            assert "hold_and_win" in feat_kinds
        if arch == "cascade":
            assert "cascade" in feat_kinds


# ─── 4. Cache hit ───────────────────────────────────────────────────────


def test_cache_hit_skips_api(tmp_path):
    """Second invocation with same prompt reads the cache + does NOT
    re-call the mock client."""
    prompt = DEMO_PROMPTS["lines"]
    client = _MockClient()
    cache_dir = tmp_path / "cache"
    r1 = generate_gdd(prompt, client=client, cache_dir=cache_dir)
    assert r1.cache_hit is False
    assert client.call_count == 1
    # Second call with the same cache_dir => cache hit, no second API call.
    r2 = generate_gdd(prompt, client=client, cache_dir=cache_dir)
    assert r2.cache_hit is True
    assert client.call_count == 1, (
        f"expected exactly 1 API call after cache hit, "
        f"got {client.call_count}"
    )
    # Bit-identical output even when one branch came from cache.
    assert r1.gdd_yaml == r2.gdd_yaml
    # Cache file exists at the expected path.
    assert r2.cache_path.exists()
    cached = load_cached(r2.cache_key, cache_dir=cache_dir)
    assert cached is not None
    assert cached["prompt"] == prompt
    assert cached["model"] == DEFAULT_MODEL
    assert cached["schema_version"] == SCHEMA_VERSION


# ─── 5. Missing API key fallback ────────────────────────────────────────


def test_missing_api_key_falls_back(tmp_path, monkeypatch, capfd):
    """When ANTHROPIC_API_KEY is missing, the CLI prints a clear
    fallback message AND shells out to ``tools.gdd_nl_ingest``."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    # Patch subprocess.call so we can assert the fallback module is
    # invoked without actually re-running the W6.1 pipeline (which is
    # already covered by its own test).
    calls: list[list[str]] = []

    def _fake_call(argv, *args, **kwargs):
        calls.append(list(argv))
        return 0

    monkeypatch.setattr(
        "tools.gdd_llm_ingest.__main__.subprocess.call", _fake_call
    )
    from tools.gdd_llm_ingest.__main__ import main as cli_main
    rc = cli_main([
        "design a 95% RTP lines slot, free spins, medium volatility",
    ])
    assert rc == 0
    err = capfd.readouterr().err
    assert "ANTHROPIC_API_KEY" in err
    assert "falling back" in err
    assert calls, "expected subprocess.call to W6.1 fallback"
    assert "tools.gdd_nl_ingest" in calls[0]


# ─── 6. End-to-end pipeline on mocked LLM GDD ───────────────────────────


@pytest.mark.slow  # W244 wave 7: ~32s end-to-end (mocked LLM + Z3 + 500k MC)
@pytest.mark.skipif(
    not ENGINE_BIN.exists(),
    reason=(
        "slot-sim release binary missing; "
        "run `cd engine/slot-sim && cargo build --release` first."
    ),
)
def test_pipeline_e2e_on_llm_gdd(tmp_path):
    """Generate a GDD via mocked LLM, run the W5.7 pipeline, assert
    all four acceptance gates PASS.  Uses the hold-and-win archetype
    prompt (the W6.2 mission's flagship demo)."""
    prompt = DEMO_PROMPTS["hold_and_win"]
    client = _MockClient()
    res = generate_gdd(
        prompt,
        client=client,
        cache_dir=tmp_path / "cache",
    )
    assert res.payload["archetype"] == "hold_and_win"
    gdd_path = tmp_path / "wolf_holdwin_llm.gdd"
    gdd_path.write_text(res.gdd_yaml, encoding="utf-8")

    out_dir = tmp_path / "pipeline-out"
    artefacts = run_pipeline(gdd_path, out_dir=out_dir)
    acc = artefacts.acceptance
    assert acc["passed"], (
        f"acceptance FAIL: gates="
        f"{[(g['name'], g['status']) for g in acc['gates']]}"
    )
    for gate in acc["gates"]:
        assert gate["status"] == "PASS", (
            f"gate {gate['name']!r} FAIL: "
            f"delta={gate['value']} tol={gate['tolerance']}"
        )
    assert artefacts.cert_zip_path.exists()
    assert artefacts.cert_zip_path.stat().st_size > 1000
