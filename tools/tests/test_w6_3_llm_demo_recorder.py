"""W6.3 — LLM demo recorder acceptance tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.gdd_llm_ingest.demo_prompts import DEMO_PROMPTS
from tools.llm_demo_recorder.__main__ import main as recorder_main


ARCHETYPES = sorted(DEMO_PROMPTS.keys())


@pytest.fixture(scope="function")
def recorder_out(tmp_path: Path) -> Path:
    out = tmp_path / "llm-demo"
    out.mkdir(parents=True, exist_ok=True)
    rc = recorder_main(["--out-dir", str(out)])
    assert rc == 0
    return out


def test_mock_demo_emits_5_casts(recorder_out: Path) -> None:
    """5 archetype `.cast` files and `.transcript.txt` files are emitted."""
    casts = sorted(p.name for p in recorder_out.glob("*.cast"))
    transcripts = sorted(p.name for p in recorder_out.glob("*.transcript.txt"))
    assert casts == [f"{a}.cast" for a in ARCHETYPES]
    assert transcripts == [f"{a}.transcript.txt" for a in ARCHETYPES]
    assert (recorder_out / "SUMMARY.md").exists()
    assert (recorder_out / "transcript.json").exists()


def test_mock_demo_deterministic(tmp_path: Path) -> None:
    """Two consecutive runs produce byte-identical artefacts."""
    a = tmp_path / "a"
    b = tmp_path / "b"
    a.mkdir(); b.mkdir()
    recorder_main(["--out-dir", str(a)])
    recorder_main(["--out-dir", str(b)])
    for name in (f"{ARCHETYPES[0]}.cast", "SUMMARY.md", "transcript.json"):
        assert (a / name).read_bytes() == (b / name).read_bytes(), (
            f"non-deterministic output: {name}"
        )


def test_summary_md_well_formed(recorder_out: Path) -> None:
    """SUMMARY.md is parseable Markdown and contains all 5 archetype sections."""
    md = (recorder_out / "SUMMARY.md").read_text(encoding="utf-8")
    # 5 ### sections (one per archetype).
    h3_count = sum(1 for line in md.splitlines() if line.startswith("### "))
    assert h3_count == 5, f"expected 5 archetype subsections, got {h3_count}"
    # Token totals footer must be present.
    assert "input_tokens_total" in md
    assert "output_tokens_total" in md
    assert "wall_clock_ms_total" in md
    for a in ARCHETYPES:
        assert a in md, f"archetype {a} missing in SUMMARY.md"


def test_live_falls_back_when_no_key(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str],
) -> None:
    """`--live` without ANTHROPIC_API_KEY prints a warning and uses mock mode."""
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    out = tmp_path / "live-fallback"
    rc = recorder_main(["--live", "--out-dir", str(out)])
    assert rc == 0
    err = capsys.readouterr().err
    assert "falling back to mock mode" in err
    transcript = json.loads((out / "transcript.json").read_text())
    assert transcript["mode"] == "mock"


def test_archetype_filter(tmp_path: Path) -> None:
    """`--archetype hold_and_win` produces exactly ONE cast file."""
    out = tmp_path / "single"
    rc = recorder_main(["--archetype", "hold_and_win", "--out-dir", str(out)])
    assert rc == 0
    casts = sorted(p.name for p in out.glob("*.cast"))
    assert casts == ["hold_and_win.cast"]
    transcripts = sorted(p.name for p in out.glob("*.transcript.txt"))
    assert transcripts == ["hold_and_win.transcript.txt"]


def test_cast_header_is_valid_json(recorder_out: Path) -> None:
    """First line of each `.cast` file is a valid asciinema header JSON."""
    for a in ARCHETYPES:
        p = recorder_out / f"{a}.cast"
        first_line = p.read_text(encoding="utf-8").splitlines()[0]
        header = json.loads(first_line)
        assert header["version"] == 2
        assert "timestamp" in header
        assert "width" in header and "height" in header


def test_transcript_json_round_trip(recorder_out: Path) -> None:
    """transcript.json is valid + has all 5 archetype records sorted."""
    raw = json.loads((recorder_out / "transcript.json").read_text())
    assert raw["schema"] == "slotmath.llm-demo-transcript/v1"
    assert raw["mode"] in {"mock", "live"}
    assert raw["n_records"] == 5
    archs = [r["archetype"] for r in raw["records"]]
    assert archs == ARCHETYPES
