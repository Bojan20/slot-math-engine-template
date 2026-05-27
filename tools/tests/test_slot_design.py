"""P10 — slot-design NL prompt → IR pipeline tests."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

from tools.slot_design import (
    parse_prompt,
    prompt_to_dsl,
)
from tools.slot_design.prompt_parser import PromptSpec, DetectedFeature


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── validation ────────────────────────────────────────────────────────────


def test_parse_prompt_rejects_empty():
    with pytest.raises(ValueError):
        parse_prompt("")
    with pytest.raises(ValueError):
        parse_prompt("   ")


def test_parse_prompt_rejects_bad_target_rtp_override():
    with pytest.raises(ValueError):
        parse_prompt("5x3 FS", target_rtp=2.0)
    with pytest.raises(ValueError):
        parse_prompt("5x3 FS", target_rtp=0.0)


# ─── topology detection ────────────────────────────────────────────────────


def test_topology_5x3():
    s = parse_prompt("5×3 slot with Free Spins")
    assert s.reels == 5
    assert s.rows == 3
    assert s.topology_shape == "lines"


def test_topology_5x3_ascii():
    s = parse_prompt("5x3 slot")
    assert s.reels == 5
    assert s.rows == 3


def test_topology_megaways():
    s = parse_prompt("Megaways slot, 117649 ways")
    assert s.topology_shape == "megaways"
    assert s.reels == 6
    assert s.paylines >= 117649


def test_topology_cluster():
    s = parse_prompt("Cluster pays 7×7 grid")
    assert s.topology_shape == "cluster"
    assert s.reels == 7
    assert s.rows == 7


def test_topology_6_reel():
    s = parse_prompt("6-reel slot with Megaways feature")
    assert s.reels == 6


def test_topology_default_when_missing():
    s = parse_prompt("Just a generic slot")
    assert s.reels == 5
    assert s.rows == 3


# ─── feature detection ────────────────────────────────────────────────────


def test_feature_free_spins():
    s = parse_prompt("5×3 slot with Free Spins")
    assert "free_spins" in s.feature_kinds


def test_feature_fs_acronym():
    s = parse_prompt("5×3 slot with FS bonus")
    assert "free_spins" in s.feature_kinds


def test_feature_hold_and_win():
    s = parse_prompt("Hold and Win mechanic")
    assert "hold_and_win" in s.feature_kinds


def test_feature_cash_bag_to_hold_and_win():
    s = parse_prompt("Cash bag accumulator slot")
    assert "hold_and_win" in s.feature_kinds


def test_feature_wheel_bonus():
    s = parse_prompt("Bonus wheel 4-tier jackpot")
    assert "wheel_bonus" in s.feature_kinds


def test_feature_pick_bonus():
    s = parse_prompt("Pick bonus mini-game")
    assert "pick_bonus" in s.feature_kinds


def test_feature_tumble_cascade():
    for prompt in ("Tumble feature", "Cascade pays", "Avalanche win"):
        s = parse_prompt(prompt)
        assert "tumble" in s.feature_kinds, f"failed for {prompt}"


def test_feature_megaways_ways():
    s = parse_prompt("Megaways slot")
    assert "megaways_ways" in s.feature_kinds


def test_feature_cluster_pays():
    s = parse_prompt("Cluster pays slot")
    assert "cluster_pays" in s.feature_kinds


def test_feature_sticky_wild():
    s = parse_prompt("Sticky wild feature")
    assert "sticky_wild" in s.feature_kinds


def test_feature_wild_expand():
    s = parse_prompt("Expanding wild mechanic")
    assert "wild_expand" in s.feature_kinds


def test_feature_multiplier():
    s = parse_prompt("Multiplier stack up to 100x")
    assert "multiplier_stack" in s.feature_kinds


def test_feature_progressive_jackpot():
    for prompt in ("Progressive jackpot", "Multi-tier jackpot"):
        s = parse_prompt(prompt)
        assert "progressive_jackpot" in s.feature_kinds


def test_feature_buy_feature():
    for prompt in ("Bonus buy at 100x", "Buy feature for direct bonus access"):
        s = parse_prompt(prompt)
        assert "buy_feature" in s.feature_kinds


def test_feature_multi_detection():
    s = parse_prompt("5×3 with Free Spins + Hold and Win + Wheel bonus + Sticky wilds")
    kinds = set(s.feature_kinds)
    assert {"free_spins", "hold_and_win", "wheel_bonus", "sticky_wild"} <= kinds


def test_feature_audit_spans():
    s = parse_prompt("Slot with Free Spins and Hold and Win")
    for f in s.features:
        assert isinstance(f, DetectedFeature)
        assert f.span_start < f.span_end
        assert f.matched_text in s.raw_prompt


# ─── target RTP detection ─────────────────────────────────────────────────


def test_rtp_fractional():
    s = parse_prompt("Slot with RTP 0.965")
    assert s.target_rtp == 0.965


def test_rtp_percent():
    s = parse_prompt("Slot with RTP 96%")
    assert s.target_rtp == 0.96


def test_rtp_bare_percent():
    s = parse_prompt("96% RTP slot")
    assert s.target_rtp == 0.96


def test_rtp_phrasal_high():
    s = parse_prompt("High-RTP slot")
    assert s.target_rtp == 0.97


def test_rtp_phrasal_low():
    s = parse_prompt("Low-RTP slot for casual market")
    assert s.target_rtp == 0.90


def test_rtp_cli_override_wins():
    s = parse_prompt("96% RTP slot", target_rtp=0.945)
    assert s.target_rtp == 0.945


def test_rtp_default_when_silent():
    s = parse_prompt("Generic slot")
    assert s.target_rtp == 0.96


# ─── volatility detection ─────────────────────────────────────────────────


def test_volatility_high():
    s = parse_prompt("High-volatility slot")
    assert s.volatility == "high"


def test_volatility_low():
    s = parse_prompt("Low-volatility casual slot")
    assert s.volatility == "low"


def test_volatility_ultra():
    s = parse_prompt("Ultra-volatility extreme slot")
    assert s.volatility == "ultra"


def test_volatility_default():
    s = parse_prompt("Generic slot")
    assert s.volatility == "medium"


# ─── vendor style + max-win ───────────────────────────────────────────────


def test_vendor_style_b():
    s = parse_prompt("Vendor B-style 5×3")
    assert s.vendor_style == "vendor_b"


def test_vendor_style_a():
    s = parse_prompt("Vendor A-like big slot")
    assert s.vendor_style == "vendor_a"


def test_vendor_style_pragmatic():
    s = parse_prompt("Pragmatic-style slot")
    assert s.vendor_style == "pragmatic"


def test_vendor_style_default():
    s = parse_prompt("Generic slot")
    assert s.vendor_style == "generic"


def test_max_win_explicit():
    s = parse_prompt("Slot with max win 10000x")
    assert s.max_win_x == 10000


def test_max_win_default():
    s = parse_prompt("Generic slot")
    assert s.max_win_x == 5000


# ─── audit log ────────────────────────────────────────────────────────────


def test_audit_log_non_empty():
    s = parse_prompt("5×3 Vendor B-style FS + HoldAndWin RTP 96.5%")
    assert len(s.audit_log) >= 4
    log_str = "\n".join(s.audit_log)
    assert "topology" in log_str
    assert "feature" in log_str


# ─── DSL builder ──────────────────────────────────────────────────────────


def test_prompt_to_dsl_meta_shape():
    s = parse_prompt("5×3 Vendor B-style FS")
    dsl = prompt_to_dsl(s)
    assert "meta" in dsl
    assert dsl["meta"]["target_rtp"] == 0.96
    assert dsl["meta"]["vendor_style"] == "vendor_b"
    assert isinstance(dsl["meta"]["design_audit"], list)


def test_prompt_to_dsl_topology_shape():
    s = parse_prompt("6-reel slot")
    dsl = prompt_to_dsl(s)
    assert dsl["topology"]["reels"] == 6


def test_prompt_to_dsl_features():
    s = parse_prompt("5×3 with FS + HoldAndWin + Wheel bonus")
    dsl = prompt_to_dsl(s)
    feature_kinds = {f["kind"] for f in dsl["features"]}
    assert "free_spins" in feature_kinds
    assert "hold_and_win" in feature_kinds
    assert "wheel_bonus" in feature_kinds


def test_prompt_to_dsl_validates_via_w62():
    """The DSL emitted must satisfy the W6.2 validator."""
    from tools.gdd_extract.dsl import dsl_validate
    s = parse_prompt("5×3 slot with FS and HoldAndWin RTP 96%")
    dsl = prompt_to_dsl(s)
    # Should not raise
    dsl_validate(dsl)


# ─── DSL → IR composition ─────────────────────────────────────────────────


def test_prompt_to_ir_via_w62_synth():
    """End-to-end NL → IR using the W6.2 deterministic synthesizer."""
    from tools.gdd_extract.dsl import dsl_to_slot_sim_ir
    s = parse_prompt("5×3 Vendor B-style FS + HoldAndWin RTP 96.5% max win 5000x")
    dsl = prompt_to_dsl(s)
    ir = dsl_to_slot_sim_ir(dsl)
    assert "meta" in ir
    assert "topology" in ir
    assert "paytable" in ir
    assert "reels" in ir


# ─── CLI integration ──────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.slot_design", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_smoke_basic_prompt(tmp_path: Path):
    out_dir = tmp_path / "game-out"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin",
        "--target-rtp", "0.965",
        "--out", str(out_dir),
        "--no-smt-lock",  # avoid z3 dependency in CI
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    assert (out_dir / "spec.json").exists()
    assert (out_dir / "game.dsl.toml").exists()
    ir_files = list(out_dir.glob("*.slot-sim.ir.json"))
    assert len(ir_files) == 1
    assert (out_dir / "REVIEW.md").exists()


def test_cli_spec_json_carries_audit(tmp_path: Path):
    out_dir = tmp_path / "audit-test"
    _run_cli([
        "5×3 with FS and HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    spec = json.loads((out_dir / "spec.json").read_text())
    assert spec["target_rtp"] == 0.965
    assert spec["reels"] == 5
    assert spec["rows"] == 3
    kinds = {f["kind"] for f in spec["features"]}
    assert "free_spins" in kinds
    assert "hold_and_win" in kinds


def test_cli_review_md_includes_summary(tmp_path: Path):
    out_dir = tmp_path / "review-test"
    _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    md = (out_dir / "REVIEW.md").read_text()
    assert "# slot-design Review" in md
    assert "Target RTP" in md
    assert "Detection audit" in md


def test_cli_requires_prompt_or_from_dsl(tmp_path: Path):
    rc = _run_cli(["--out", str(tmp_path)])
    assert rc.returncode != 0


def test_cli_from_dsl_loads_existing(tmp_path: Path):
    # First emit a DSL via prompt
    out1 = tmp_path / "first"
    _run_cli([
        "5×3 with FS RTP 0.94",
        "--out", str(out1),
        "--no-smt-lock",
        "--quiet",
    ])
    dsl_path = out1 / "game.dsl.toml"
    # Then load it via --from-dsl
    out2 = tmp_path / "second"
    rc = _run_cli([
        "--from-dsl", str(dsl_path),
        "--out", str(out2),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr: {rc.stderr}"
    ir_files = list(out2.glob("*.slot-sim.ir.json"))
    assert len(ir_files) == 1


# ─── 10-prompt acceptance suite ───────────────────────────────────────────


# Wide coverage across topology / features / RTP / vendor.
ACCEPTANCE_PROMPTS = [
    "5×3 slot with Free Spins",
    "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
    "6-reel Megaways slot with Cascade RTP 96%",
    "7×7 Cluster pays slot with Tumble feature",
    "5×3 high-volatility slot with Sticky wild and Bonus wheel max win 25000x",
    "Vendor A-style 5×3 with Pick bonus and Free Spins RTP 96%",
    "Pragmatic-style 6×4 slot with Bonus buy at 100x RTP 96.5%",
    "5×3 low-RTP slot with Expanding wild and Free Spins",
    "5×3 ultra-volatility slot with Multiplier and Progressive jackpot",
    "5×3 medium-volatility slot with Free Spins + Wheel bonus + Sticky wild",
]


@pytest.mark.parametrize("prompt", ACCEPTANCE_PROMPTS)
def test_acceptance_prompt_parses_to_valid_dsl(prompt: str):
    """Each acceptance prompt parses + emits a W6.2-validateable DSL."""
    from tools.gdd_extract.dsl import dsl_validate
    s = parse_prompt(prompt)
    dsl = prompt_to_dsl(s)
    dsl_validate(dsl)  # raises on bad DSL
    # Must detect at least one feature (every acceptance prompt has one)
    assert len(s.feature_kinds) >= 1, f"no features detected in: {prompt}"


@pytest.mark.parametrize("prompt", ACCEPTANCE_PROMPTS)
def test_acceptance_prompt_emits_valid_ir(prompt: str, tmp_path: Path):
    """End-to-end: prompt → IR JSON via CLI smoke."""
    out_dir = tmp_path / "acc"
    rc = _run_cli([
        prompt,
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0, f"stderr for '{prompt}': {rc.stderr}"
    ir_files = list(out_dir.glob("*.slot-sim.ir.json"))
    assert len(ir_files) == 1
    ir = json.loads(ir_files[0].read_text())
    assert "meta" in ir
    assert "paytable" in ir
    assert len(ir["paytable"]) > 0
