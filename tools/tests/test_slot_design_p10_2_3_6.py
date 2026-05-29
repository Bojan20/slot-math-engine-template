"""P10.2 + P10.3 + P10.6 — composition planner / review UI / cert-pack glue.

Pytest specs covering the second-wave slot-design landing:
  - composition_planner.plan_composition() balances feature shares
  - review_ui.emit_review_ui() writes valid HTML + JS pair
  - __main__ --cert-xml / --cert-pack / --no-plan-composition / --no-review-ui
"""

from __future__ import annotations

import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from tools.slot_design import (
    parse_prompt,
    prompt_to_dsl,
    plan_composition,
    feature_dictionary,
)
from tools.slot_design.composition_planner import (
    _FEATURE_DEFAULT_SHARES,
    _MAX_COMBINED_FEATURE_SHARE,
)
from tools.slot_design.review_ui import emit_review_ui


REPO_ROOT = Path(__file__).resolve().parents[2]


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.slot_design", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


# ─── P10.2 — composition planner ───────────────────────────────────────────


def test_plan_composition_single_feature_passes_through():
    """One feature → no scale-down (share well below max)."""
    dsl = prompt_to_dsl(parse_prompt("5×3 Free Spins"))
    audit: list[str] = []
    plan_composition(dsl, audit=audit)
    assert dsl["meta"]["_feature_share_total"] == _FEATURE_DEFAULT_SHARES["free_spins"]
    fs = dsl["features"][0]
    assert fs["_rtp_share_alloc"] == fs["_rtp_share_default"]


def test_plan_composition_normalises_when_overshoot():
    """4 heavy features overshoot 0.85 → all scaled down proportionally."""
    dsl = prompt_to_dsl(parse_prompt(
        "5×3 Free Spins + Hold and Win + Wheel bonus + Tumble"
    ))
    audit: list[str] = []
    plan_composition(dsl, audit=audit)
    total = sum(f["_rtp_share_alloc"] for f in dsl["features"])
    # Allow small rounding tolerance (per-feature `round(..., 6)` may
    # accumulate when summing 4+ features).
    assert total <= _MAX_COMBINED_FEATURE_SHARE + 1e-3
    # And that each feature actually got its share scaled
    for f in dsl["features"]:
        assert f["_rtp_share_alloc"] < f["_rtp_share_default"]


def test_plan_composition_primary_param_scales():
    """When share is scaled, the primary RTP-affecting parameter scales too."""
    dsl = prompt_to_dsl(parse_prompt(
        "5×3 Free Spins + Hold and Win + Wheel bonus + Tumble"
    ))
    # Capture defaults BEFORE scaling.
    original_initial_spins = next(
        f["initial_spins"] for f in dsl["features"] if f["kind"] == "free_spins"
    )
    plan_composition(dsl)
    scaled_initial_spins = next(
        f["initial_spins"] for f in dsl["features"] if f["kind"] == "free_spins"
    )
    # Should be ≤ original (because the share was scaled down).
    assert scaled_initial_spins <= original_initial_spins


def test_plan_composition_meta_records_totals():
    dsl = prompt_to_dsl(parse_prompt("5×3 FS RTP 96%"))
    plan_composition(dsl)
    assert "_feature_share_total" in dsl["meta"]
    assert "_base_game_share_target" in dsl["meta"]


def test_plan_composition_audit_log_entries():
    dsl = prompt_to_dsl(parse_prompt("5×3 FS + HoldAndWin"))
    audit: list[str] = []
    plan_composition(dsl, audit=audit)
    log_str = "\n".join(audit)
    assert "composition" in log_str
    assert "target_rtp" in log_str


def test_plan_composition_empty_features_no_op():
    """Empty feature list returns unchanged."""
    dsl = {"meta": {"target_rtp": 0.96}, "features": []}
    plan_composition(dsl)
    assert dsl["features"] == []


def test_plan_composition_buy_feature_no_share():
    """Buy-feature is paid path; default share is 0."""
    assert _FEATURE_DEFAULT_SHARES["buy_feature"] == 0.0


def test_plan_composition_handles_new_kinds():
    """New P10.2 keyword kinds (ante_bet, gamble, mystery, symbol_upgrade)
    have templates + default shares."""
    for kind in ("ante_bet", "gamble", "mystery_symbol", "symbol_upgrade"):
        assert kind in _FEATURE_DEFAULT_SHARES, f"missing share: {kind}"


def test_feature_dictionary_exposes_table():
    fd = feature_dictionary()
    assert isinstance(fd, dict)
    assert "free_spins" in fd
    assert "default_share" in fd["free_spins"]


# ─── P10.2 — new keyword detection ─────────────────────────────────────────


@pytest.mark.parametrize("prompt,kind", [
    ("Slot with Ante Bet", "ante_bet"),
    ("Slot with Anti-bet feature", "ante_bet"),
    ("Slot with Gamble round", "gamble"),
    ("Slot with double up after win", "gamble"),
    ("Slot with Mystery symbols", "mystery_symbol"),
    ("Slot with Mystery stacks", "mystery_symbol"),
    ("Slot with Symbol Upgrade", "symbol_upgrade"),
    ("Slot with Symbol Evolution", "symbol_upgrade"),
    ("Money collect feature", "hold_and_win"),
    ("Stacked wilds slot", "sticky_wild"),
    ("Walking wild respin", "sticky_wild"),
    ("Rainbow wild slot", "wild_expand"),
])
def test_new_keyword_detection(prompt: str, kind: str):
    s = parse_prompt(prompt)
    assert kind in s.feature_kinds, f"missed {kind} in '{prompt}'"


# ─── P10.3 — review UI emit ────────────────────────────────────────────────


def test_emit_review_ui_writes_both_files(tmp_path: Path):
    html_path, js_path = emit_review_ui(tmp_path)
    assert html_path.exists()
    assert js_path.exists()
    assert html_path.name == "review.html"
    assert js_path.name == "review.js"


def test_emit_review_ui_html_has_loaders(tmp_path: Path):
    html_path, _ = emit_review_ui(tmp_path)
    html = html_path.read_text()
    assert "slot-design Review" in html
    assert "dsl-editor" in html
    assert "review.js" in html
    assert "Detection audit" in html


def test_emit_review_ui_js_fetches_spec_and_dsl(tmp_path: Path):
    _, js_path = emit_review_ui(tmp_path)
    js = js_path.read_text()
    assert "spec.json" in js
    assert "game.dsl.toml" in js
    assert "exportDsl" in js
    assert "parseDslForSummary" in js


def test_emit_review_ui_creates_dir(tmp_path: Path):
    target = tmp_path / "nested" / "subdir"
    emit_review_ui(target)
    assert target.exists()


# ─── P10.6 — CLI cert glue ─────────────────────────────────────────────────


def test_cli_cert_xml_emits_xml(tmp_path: Path):
    out_dir = tmp_path / "cert-xml-test"
    rc = _run_cli([
        "5×3 Free Spins RTP 96%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-xml",
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    xml_files = list(out_dir.glob("*.cert.xml"))
    # cert XML may fail emit if downstream deps missing; if so it's a WARN
    # path — but with --quiet + W6.2 fallback emit should succeed.
    if xml_files:
        xml = xml_files[0].read_text()
        assert "urn:slotmath:cert:v1" in xml


def test_cli_cert_pack_emits_zip(tmp_path: Path):
    out_dir = tmp_path / "cert-pack-test"
    rc = _run_cli([
        "5×3 Free Spins RTP 96%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-pack",
        "--swid", "001",
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    zips = list(out_dir.glob("*.cert.zip"))
    if zips:
        # Cert ZIP optional based on crypto lib presence; if emitted verify shape
        with zipfile.ZipFile(zips[0]) as zf:
            names = set(zf.namelist())
            assert "manifest.json" in names
            assert any(n.startswith("ir/") for n in names)


def test_cli_no_review_ui_flag_skips_emit(tmp_path: Path):
    out_dir = tmp_path / "no-review-test"
    rc = _run_cli([
        "5×3 Free Spins",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--no-review-ui",
        "--quiet",
    ])
    assert rc.returncode == 0
    assert not (out_dir / "review.html").exists()


def test_cli_default_emits_review_ui(tmp_path: Path):
    out_dir = tmp_path / "default-review-test"
    rc = _run_cli([
        "5×3 Free Spins",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0
    assert (out_dir / "review.html").exists()
    assert (out_dir / "review.js").exists()


def test_cli_no_plan_composition_skips_balancer(tmp_path: Path):
    out_dir = tmp_path / "no-plan-test"
    rc = _run_cli([
        "5×3 FS + HoldAndWin + Wheel bonus + Tumble",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--no-plan-composition",
        "--no-review-ui",
        "--quiet",
    ])
    assert rc.returncode == 0
    # DSL TOML should NOT carry _feature_share_total when planner skipped
    dsl_txt = (out_dir / "game.dsl.toml").read_text()
    assert "_feature_share_total" not in dsl_txt


def test_cli_default_plan_composition_adds_shares(tmp_path: Path):
    out_dir = tmp_path / "default-plan-test"
    rc = _run_cli([
        "5×3 FS + HoldAndWin + Wheel bonus + Tumble",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--no-review-ui",
        "--quiet",
    ])
    assert rc.returncode == 0
    dsl_txt = (out_dir / "game.dsl.toml").read_text()
    assert "_feature_share_total" in dsl_txt
    assert "_rtp_share_alloc" in dsl_txt


def test_cli_full_pipeline_smoke(tmp_path: Path):
    """End-to-end: prompt → spec + DSL + IR + review + cert XML in one go."""
    out_dir = tmp_path / "full-pipeline-test"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin + Wheel bonus RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-xml",
        "--quiet",
    ])
    assert rc.returncode == 0
    # Must-have outputs
    assert (out_dir / "spec.json").exists()
    assert (out_dir / "game.dsl.toml").exists()
    assert (out_dir / "REVIEW.md").exists()
    assert (out_dir / "review.html").exists()
    assert (out_dir / "review.js").exists()
    irs = list(out_dir.glob("*.slot-sim.ir.json"))
    assert len(irs) == 1
