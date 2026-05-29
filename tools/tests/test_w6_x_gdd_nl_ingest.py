"""W6.x — GDD NL ingestion tests.

Verifies the prompt → GDD → archetype pipeline for the 5 archetype
classes the W6.x detector supports.  Uses a 30k spin smoke budget
to keep the suite fast.
"""

from __future__ import annotations

import pytest

from tools.gdd_nl_ingest.ingest import (
    detect_archetype,
    prompt_to_gdd,
    ingest_prompt,
    _gdd_to_yaml,
)
from tools.greenfield_demo.archetype_pipeline import (
    ENGINE_BIN, _parse_yaml_subset,
)


pytestmark = pytest.mark.skipif(
    not ENGINE_BIN.exists(),
    reason=f"slot-sim release binary missing: {ENGINE_BIN}",
)


@pytest.mark.parametrize("prompt,expected_archetype", [
    ("5x3 lines slot, 20 paylines, RTP 95, medium volatility, free spins",
     "lines"),
    ("5x3 slot with 243 ways, RTP 96, medium volatility, free spins",
     "ways"),
    ("Megaways slot, RTP 95, high volatility, free spins",
     "megaways"),
    ("5x3 hold-and-win slot, 20 paylines, RTP 94, high volatility, free spins",
     "hold_and_win"),
    ("5x3 cascade slot, RTP 96, medium volatility, free spins",
     "cascade"),
])
def test_detect_archetype(prompt: str, expected_archetype: str):
    """The archetype classifier must pick the correct archetype for
    each canonical phrasing.
    """
    archetype, matches = detect_archetype(prompt)
    assert archetype == expected_archetype, (
        f"prompt: {prompt!r}\nexpected: {expected_archetype}\n"
        f"got: {archetype}\nmatches: {matches}"
    )


def test_detect_archetype_returns_none_for_ambiguous_prompt():
    """A prompt with no recognised mechanic keyword should return None."""
    archetype, _matches = detect_archetype("RTP 95, medium volatility")
    assert archetype is None


@pytest.mark.parametrize("prompt,expected_archetype", [
    ("5x3 lines slot, 20 paylines, RTP 95, medium volatility, free spins",
     "lines"),
    ("Megaways slot, RTP 95, high volatility, free spins",
     "megaways"),
])
def test_prompt_to_gdd_round_trips_through_yaml_parser(
    prompt: str, expected_archetype: str,
):
    """`prompt_to_gdd` → `_gdd_to_yaml` → archetype pipeline YAML
    parser must round-trip without information loss.
    """
    gdd_dict, detected, questions = prompt_to_gdd(prompt)
    assert not questions, f"unexpected ambiguity questions: {questions}"
    assert gdd_dict["archetype"] == expected_archetype
    yaml_str = _gdd_to_yaml(gdd_dict)
    re_parsed = _parse_yaml_subset(yaml_str)
    assert re_parsed["archetype"] == expected_archetype
    assert re_parsed["meta"]["name"] == gdd_dict["meta"]["name"]
    assert re_parsed["constraints"]["target_rtp"] == \
        gdd_dict["constraints"]["target_rtp"]


def test_prompt_to_gdd_extracts_rtp_correctly():
    """RTP regex must handle both `RTP 95`, `RTP 95.5`, `RTP 95%`,
    and `RTP 0.95` forms.
    """
    for raw, want in [
        ("5x3 lines, RTP 95",     0.95),
        ("5x3 lines, RTP 95.5",   0.955),
        ("5x3 lines, RTP 95%",    0.95),
        ("5x3 lines, RTP 0.95",   0.95),
    ]:
        gdd, _det, _q = prompt_to_gdd(raw)
        assert gdd["constraints"]["target_rtp"] == pytest.approx(want, abs=1e-4), (
            f"prompt {raw!r}: expected RTP {want}, got "
            f"{gdd['constraints']['target_rtp']}"
        )


def test_ambiguous_prompt_returns_questions(tmp_path):
    """A prompt with no recognised mechanic should produce
    AMBIGUOUS verdict with at least one clarifying question.
    """
    result = ingest_prompt(
        "high volatility, RTP 95",
        out_dir=tmp_path, spins=10_000,
    )
    assert result.verdict == "AMBIGUOUS"
    assert result.archetype is None
    assert len(result.ambiguous_questions) > 0


def test_ingest_prompt_emits_gdd_and_runs_pipeline(tmp_path):
    """The end-to-end ingest call should write a GDD file + run the
    archetype pipeline + return PASS on a simple lines prompt.
    """
    result = ingest_prompt(
        "5x3 lines slot, 20 paylines, RTP 95, medium volatility, free spins",
        out_dir=tmp_path, spins=200_000,
    )
    assert result.verdict == "PASS", (
        f"ingest pipeline verdict={result.verdict}, gates="
        f"{result.pipeline_acceptance.get('gates') if result.pipeline_acceptance else 'no acceptance'}"
    )
    assert result.gdd_path is not None and result.gdd_path.exists()
    assert result.cert_zip is not None and result.cert_zip.exists()
    assert result.mc_rtp is not None
    assert abs(result.mc_rtp - 0.95) <= 0.01, (
        f"mc_rtp {result.mc_rtp} outside ±1% of target 0.95"
    )
