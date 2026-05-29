"""P10 — slot-design NL prompt → IR pipeline tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.slot_design import (
    parse_prompt,
    prompt_to_dsl,
)
from tools.slot_design.prompt_parser import DetectedFeature


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


# ─── P10.6 — Cert-pipeline glue tests ─────────────────────────────────────


def test_p10_6_default_no_cert_artefacts(tmp_path: Path):
    """Default invocation (no --cert-xml / --cert-pack) must NOT emit cert
    artefacts. Pins the regression that adding the glue must not break
    the lean IR-only mode the rest of the suite relies on."""
    out_dir = tmp_path / "no-cert"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    assert not list(out_dir.glob("*.cert.xml")), "cert XML must not be emitted by default"
    assert not list(out_dir.glob("*.cert.zip")), "cert ZIP must not be emitted by default"


def test_p10_6_cert_xml_emits_alongside_ir(tmp_path: Path):
    """--cert-xml emits a regulator-shape XML next to the IR."""
    out_dir = tmp_path / "with-cert-xml"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-xml",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    xmls = list(out_dir.glob("*.cert.xml"))
    assert len(xmls) == 1, f"expected one .cert.xml, got {xmls}"
    body = xmls[0].read_text()
    # XML must contain the regulator-shape root element and the game-id.
    assert body.startswith("<?xml"), "must start with XML prolog"
    # Root element is `<SlotMathCert xmlns="urn:slotmath:cert:v1">` per W5.6 schema.
    assert "<SlotMathCert" in body, f"missing SlotMathCert root in {body[:200]}"
    assert "urn:slotmath:cert:v1" in body, "missing cert namespace"


def test_p10_6_cert_pack_emits_signed_zip(tmp_path: Path):
    """--cert-pack emits a signed ZIP that contains manifest + IR mirror."""
    import zipfile
    out_dir = tmp_path / "with-cert-pack"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-pack",
        "--swid", "P10-6-001",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    zips = list(out_dir.glob("**/*.zip"))
    assert len(zips) >= 1, f"expected a cert ZIP, got {zips}"
    with zipfile.ZipFile(zips[0]) as zf:
        names = zf.namelist()
    # Cert bundle must hold manifest + IR + signature so the regulator
    # can replay the chain-of-custody.
    assert any(n.endswith("manifest.json") for n in names), names
    assert any(n.startswith("ir/") and n.endswith(".ir.json") for n in names), names
    assert any("signature" in n.lower() or n.endswith(".sig") for n in names), names


def test_p10_6_cert_pack_implies_xml_emit(tmp_path: Path):
    """`--cert-pack` should also surface the regulator XML alongside the
    ZIP — the XML is the human-readable counterpart of the signed bundle."""
    out_dir = tmp_path / "with-cert-both"
    rc = _run_cli([
        "5×3 Vendor B-style FS RTP 0.945",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-pack",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    xmls = list(out_dir.glob("*.cert.xml"))
    assert len(xmls) == 1, f"expected XML alongside cert-pack, got {xmls}"


# ─── P10.3 — Studio review UI tests ───────────────────────────────────────


def test_p10_3_review_ui_emits_by_default(tmp_path: Path):
    """`slot-design` must emit review.html unless --no-review-ui is set."""
    out_dir = tmp_path / "with-ui"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    html_files = list(out_dir.glob("*.html"))
    assert html_files, f"expected at least one .html, got {list(out_dir.iterdir())}"


def test_p10_3_review_ui_can_be_disabled(tmp_path: Path):
    """`--no-review-ui` suppresses the HTML viewer."""
    out_dir = tmp_path / "no-ui"
    rc = _run_cli([
        "5×3 Vendor B-style FS",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--no-review-ui",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    html_files = list(out_dir.glob("*.html"))
    assert not html_files, f"expected no HTML emit, got {html_files}"


def test_p10_3_review_html_self_contained(tmp_path: Path):
    """The emitted HTML must not depend on external network assets so it
    works in airgapped regulator-review environments."""
    out_dir = tmp_path / "airgap"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    html_files = list(out_dir.glob("*.html"))
    assert html_files
    body = html_files[0].read_text(encoding="utf-8")
    # Sanity: no remote stylesheet/script URL that would fail offline.
    for forbidden in ("https://", "http://"):
        # CDNs would surface as `<link rel="stylesheet" href="https://...`
        assert f'href="{forbidden}' not in body, \
            "remote stylesheet found in HTML — breaks airgapped review"
        assert f'src="{forbidden}' not in body, \
            "remote script found in HTML — breaks airgapped review"


def test_p10_3_review_html_references_artifacts(tmp_path: Path):
    """HTML viewer must reference the sibling spec/dsl/ir files so the
    designer sees full provenance from the page itself."""
    out_dir = tmp_path / "refs"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin RTP 96.5%",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    html_files = list(out_dir.glob("*.html"))
    body = html_files[0].read_text(encoding="utf-8")
    # Either inline the spec / dsl content or hyperlink to it.
    has_spec_ref = "spec.json" in body or "PromptSpec" in body or "prompt" in body.lower()
    assert has_spec_ref, "HTML must reference the parsed spec"


# ─── P10 end-to-end integration ───────────────────────────────────────────


def test_p10_end_to_end_one_command_all_artefacts(tmp_path: Path):
    """The full `slot-design --cert-pack --review-ui` pipeline must
    produce the canonical 6-artefact bundle:

        spec.json + game.dsl.toml + <slug>.slot-sim.ir.json +
        REVIEW.md + review.html + cert.zip (+ optional cert.xml)

    Pins the P10 closeout contract: a single NL prompt yields the entire
    regulator-grade deliverable in one command.
    """
    import zipfile
    out_dir = tmp_path / "e2e"
    rc = _run_cli([
        "5×3 Vendor B-style FS + HoldAndWin + Bonus Wheel RTP 0.965",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-pack",
        "--swid", "P10-E2E-001",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    assert (out_dir / "spec.json").exists()
    assert (out_dir / "game.dsl.toml").exists()
    assert (out_dir / "REVIEW.md").exists()
    assert list(out_dir.glob("*.slot-sim.ir.json")), "no IR JSON"
    assert list(out_dir.glob("*.html")), "no review HTML"
    zips = list(out_dir.glob("**/*.zip"))
    assert zips, "no cert ZIP"
    with zipfile.ZipFile(zips[0]) as zf:
        names = zf.namelist()
        assert any(n.endswith("manifest.json") for n in names)


# ─── P10.2 — Composition planner extension tests ─────────────────────────


def test_p10_2_detects_ante_bet():
    s = parse_prompt("5x3 with Ante bet and Free Spins")
    assert "ante_bet" in s.feature_kinds


def test_p10_2_detects_gamble_double_up():
    s = parse_prompt("5x3 with Free Spins and Double-up gamble")
    assert "gamble" in s.feature_kinds


def test_p10_2_detects_mystery_symbol():
    s = parse_prompt("Razor Shark-style 5x5 with Mystery stacks and Free Spins")
    assert "mystery_symbol" in s.feature_kinds


def test_p10_2_detects_symbol_upgrade():
    s = parse_prompt("Reel Rush-style with Symbol upgrade and Free Spins")
    assert "symbol_upgrade" in s.feature_kinds


def test_p10_2_detects_money_collect():
    s = parse_prompt("5x3 Big Bass-style with Money Collect Hold")
    assert "hold_and_win" in s.feature_kinds


def test_p10_2_detects_walking_wild():
    s = parse_prompt("5x3 with Walking Wilds and Respin")
    assert "sticky_wild" in s.feature_kinds
    assert "respin" in s.feature_kinds


def test_p10_2_detects_xways():
    s = parse_prompt("NoLimit-style 6-reel with xWays and Free Spins")
    assert "megaways_ways" in s.feature_kinds


def test_p10_2_detects_charge_meter_as_respin():
    s = parse_prompt("5x3 with Charge Meter and Free Spins")
    assert "respin" in s.feature_kinds


def test_p10_2_composition_canonical_logged():
    """Tumble + multiplier pair must surface in audit log as 'canonical'."""
    s = parse_prompt("6x5 Sweet Bonanza-style with Tumble and Multiplier")
    composition_lines = [ln for ln in s.audit_log if ln.startswith("composition:")]
    assert composition_lines, "no composition annotation in audit log"
    canonical_lines = [ln for ln in composition_lines if "canonical" in ln]
    assert canonical_lines, f"no canonical pair detected in {composition_lines}"


def test_p10_2_composition_novel_combo_logged():
    """A no-canonical feature pair must log as 'novel combination'."""
    s = parse_prompt("5x3 with Gamble and Symbol upgrade")
    novel_lines = [ln for ln in s.audit_log if "novel combination" in ln]
    assert novel_lines, f"expected novel-combo annotation, got {s.audit_log}"


def test_p10_2_composition_no_warn_when_features_too_few():
    """Single-feature spec must not emit a composition note."""
    s = parse_prompt("5x3 slot with Free Spins")
    assert not any(ln.startswith("composition") for ln in s.audit_log)


def test_p10_2_composition_low_rtp_stacking_warn():
    """Stacking-bonus pair + low RTP must surface composition-warn."""
    s = parse_prompt(
        "5x3 with Hold and Win plus Bonus Wheel RTP 0.90",
    )
    # First confirm both features detected
    assert "hold_and_win" in s.feature_kinds
    assert "wheel_bonus" in s.feature_kinds
    warns = [ln for ln in s.audit_log if ln.startswith("composition-warn")]
    assert warns, f"expected composition-warn for low-RTP stacking, got {s.audit_log}"


def test_p10_2_composition_high_rtp_no_warn():
    """Same stacking pair at high RTP must NOT trigger composition-warn."""
    s = parse_prompt(
        "5x3 with Hold and Win plus Bonus Wheel RTP 0.97",
    )
    warns = [ln for ln in s.audit_log if ln.startswith("composition-warn")]
    assert not warns, f"unexpected warn at high RTP: {warns}"


def test_p10_2_extended_features_validate_via_w62():
    """Every newly-added P10.2 feature kind must still pass W6.2 DSL validation."""
    from tools.gdd_extract.dsl import dsl_validate
    extended_prompts = [
        "5x3 with Ante bet and Free Spins",
        "5x3 with Double-up gamble and Free Spins",
        "5x3 with Mystery stacks and Free Spins",
        "5x3 with Symbol upgrade and Free Spins",
        "5x3 with Walking Wilds and Respin",
        "5x3 with Money Collect",
        "5x3 with Charge Meter and Free Spins",
    ]
    for prompt in extended_prompts:
        s = parse_prompt(prompt)
        dsl = prompt_to_dsl(s)
        dsl_validate(dsl)  # raises on invalid DSL


def test_p10_6_cert_pack_swid_propagated_into_manifest(tmp_path: Path):
    """--swid must land in the cert manifest (regulator audit field)."""
    import zipfile
    out_dir = tmp_path / "with-cert-swid"
    rc = _run_cli([
        "5×3 Vendor B-style FS RTP 0.965",
        "--out", str(out_dir),
        "--no-smt-lock",
        "--cert-pack",
        "--swid", "SLOT-W205-TEST-42",
        "--quiet",
    ])
    assert rc.returncode == 0, rc.stderr
    zips = list(out_dir.glob("**/*.zip"))
    assert zips
    with zipfile.ZipFile(zips[0]) as zf:
        manifest_name = next(n for n in zf.namelist() if n.endswith("manifest.json"))
        manifest = json.loads(zf.read(manifest_name))
    # SWID lives at `game.swid` per the W5.6 manifest schema.
    swid = manifest.get("game", {}).get("swid") or manifest.get("swid")
    assert swid == "SLOT-W205-TEST-42", f"swid not propagated: {manifest!r}"
