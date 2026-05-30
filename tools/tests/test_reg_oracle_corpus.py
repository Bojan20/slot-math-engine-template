"""W244 wave 9 — reg-oracle corpus bootstrap acceptance tests."""
from __future__ import annotations

import hashlib
import json
import subprocess
import sys
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
TRACES = REPO / "agents" / "reg-oracle" / "corpus" / "traces.jsonl"
MANIFEST = REPO / "agents" / "reg-oracle" / "manifest.yaml"
EVAL = REPO / "agents" / "reg-oracle" / "eval" / "held_out.yaml"
PROFILES = REPO / "tools" / "jurisdiction" / "profiles"


def _run_bootstrap() -> int:
    """Invoke the corpus bootstrap CLI; return exit code."""
    rc = subprocess.run(
        [sys.executable, "-m", "tools.reg_oracle.bootstrap_corpus"],
        cwd=str(REPO),
        capture_output=True,
        text=True,
        timeout=30,
    )
    return rc.returncode


def test_manifest_parses_and_has_required_fields():
    m = yaml.safe_load(MANIFEST.read_text(encoding="utf-8"))
    assert m["name"] == "reg-oracle"
    assert "description" in m
    assert "corpus_targets" in m
    assert "eval" in m and "held_out_file" in m["eval"]
    assert "determinism" in m
    assert m["determinism"]["default_seed"] == 42


def test_held_out_eval_parses_and_covers_12_cases():
    e = yaml.safe_load(EVAL.read_text(encoding="utf-8"))
    assert e["schema"] == "urn:slotmath:reg-oracle:eval:v1"
    cases = e["cases"]
    assert len(cases) >= 12, f"need >= 12 eval cases, have {len(cases)}"
    # Every case has stable id + severity
    ids = [c["id"] for c in cases]
    assert len(ids) == len(set(ids)), "eval case ids must be unique"
    for c in cases:
        assert c["severity"] in {"critical", "high", "medium", "low"}


def test_bootstrap_runs_clean():
    assert _run_bootstrap() == 0


def test_traces_jsonl_well_formed():
    _run_bootstrap()
    lines = TRACES.read_text(encoding="utf-8").splitlines()
    assert len(lines) >= 110, f"expect >= 110 traces (12 profiles × 9 fields + few-shot), got {len(lines)}"
    for ln in lines:
        rec = json.loads(ln)
        assert rec["agent"] == "reg-oracle"
        assert rec["source"] in {"profile", "few_shot_example", "spec"}
        assert "trace_id" in rec
        assert "text" in rec
        assert len(rec["text"]) > 20  # not empty stub


def test_traces_jsonl_byte_deterministic_across_two_runs():
    """Bootstrap → hash → bootstrap → hash → assert equal."""
    _run_bootstrap()
    h1 = hashlib.sha256(TRACES.read_bytes()).hexdigest()
    _run_bootstrap()
    h2 = hashlib.sha256(TRACES.read_bytes()).hexdigest()
    assert h1 == h2, (
        f"reg-oracle traces.jsonl drifted across reruns — "
        f"determinism contract broken: {h1} vs {h2}"
    )


def test_traces_cover_all_12_jurisdictions():
    _run_bootstrap()
    lines = TRACES.read_text(encoding="utf-8").splitlines()
    jurisdictions_seen = set()
    for ln in lines:
        rec = json.loads(ln)
        j = rec.get("metadata", {}).get("jurisdiction")
        if j:
            jurisdictions_seen.add(j)
    profile_jurisdictions = {p.stem for p in PROFILES.glob("*.yaml")}
    missing = profile_jurisdictions - jurisdictions_seen
    assert not missing, f"jurisdictions in profiles/ but absent from traces: {missing}"


def test_examples_render_as_trace_records():
    """Each .md under examples/ must surface as a few_shot_example trace."""
    _run_bootstrap()
    lines = TRACES.read_text(encoding="utf-8").splitlines()
    few_shot = [json.loads(ln) for ln in lines
                if json.loads(ln)["source"] == "few_shot_example"]
    md_count = len(list((REPO / "agents" / "reg-oracle" / "examples").glob("*.md")))
    assert len(few_shot) == md_count, (
        f"few_shot trace count {len(few_shot)} != markdown file count {md_count}"
    )
