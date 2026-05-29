"""W7.4 — GDD → Asset Manifest Pipeline tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.gdd_asset_pipeline.pipeline import (
    GddSpec,
    build_asset_manifest,
    build_narration_scripts,
    build_scene_graph_stub,
    build_symbol_assets,
    procedural_bgm_curve,
    write_manifest_yaml,
)


def _spec(**overrides) -> GddSpec:
    defaults = dict(
        game_id="GAME-001",
        name="Crimson Tiger",
        theme="jungle",
        mood="epic",
        volatility_class="high",
        symbols=["Tiger", "Lotus", "Bamboo", "Wild", "Scatter"],
        features=["free_spins", "hold_and_win"],
    )
    defaults.update(overrides)
    return GddSpec(**defaults)


# ─── Spec validation ────────────────────────────────────────────────


def test_spec_rejects_empty_game_id() -> None:
    s = _spec(game_id="")
    with pytest.raises(ValueError):
        s.validate()


def test_spec_rejects_empty_symbols() -> None:
    s = _spec(symbols=[])
    with pytest.raises(ValueError):
        s.validate()


def test_spec_rejects_unknown_volatility() -> None:
    s = _spec(volatility_class="cosmic")
    with pytest.raises(ValueError):
        s.validate()


def test_spec_hash_is_deterministic() -> None:
    a = _spec()
    b = _spec()
    assert a.canonical_hash() == b.canonical_hash()
    assert len(a.canonical_hash()) == 64


def test_spec_hash_changes_on_field_change() -> None:
    a = _spec()
    b = _spec(theme="aztec")
    assert a.canonical_hash() != b.canonical_hash()


# ─── Symbol assets ──────────────────────────────────────────────────


def test_build_symbol_assets_yields_one_per_symbol() -> None:
    spec = _spec()
    assets = build_symbol_assets(spec)
    assert len(assets) == len(spec.symbols)
    assert all(a.aspect_ratio == "1:1" for a in assets)


def test_symbol_seed_is_deterministic_across_calls() -> None:
    a1 = build_symbol_assets(_spec())
    a2 = build_symbol_assets(_spec())
    assert [s.seed_hint for s in a1] == [s.seed_hint for s in a2]


def test_symbol_prompts_include_theme_and_style_cues() -> None:
    spec = _spec(theme="aztec", mood="noir")
    assets = build_symbol_assets(spec)
    for a in assets:
        assert "aztec" in a.prompt
        # noir mood → monochrome style tag should appear in prompt or tags.
        assert "monochrome" in a.style_tags


# ─── Narration scripts ──────────────────────────────────────────────


def test_narration_includes_enter_and_big_win_for_every_feature() -> None:
    spec = _spec()
    scripts = build_narration_scripts(spec)
    for feature in spec.features:
        cue_ids = {s.cue_id for s in scripts if s.feature_kind == feature}
        assert f"{feature}.enter" in cue_ids
        assert f"{feature}.big_win" in cue_ids


def test_narration_adds_retrigger_for_free_spins() -> None:
    spec = _spec(features=["free_spins"])
    scripts = build_narration_scripts(spec)
    assert any(s.cue_id == "free_spins.retrigger" for s in scripts)


def test_narration_adds_jackpot_for_hold_and_win() -> None:
    spec = _spec(features=["hold_and_win"])
    scripts = build_narration_scripts(spec)
    assert any(s.cue_id == "hold_and_win.jackpot" for s in scripts)


def test_narration_voice_persona_matches_mood() -> None:
    epic = build_narration_scripts(_spec(mood="epic"))
    playful = build_narration_scripts(_spec(mood="playful"))
    assert all(s.voice_persona == "warm_baritone" for s in epic)
    assert all(s.voice_persona == "bright_alto" for s in playful)


# ─── BGM curves ─────────────────────────────────────────────────────


def test_bgm_curve_count_is_4_phases() -> None:
    curves = procedural_bgm_curve("medium")
    assert len(curves) == 4
    assert {c.phase for c in curves} == {"lobby", "base_game", "bonus", "big_win"}


def test_bgm_tempo_scales_with_volatility() -> None:
    low = procedural_bgm_curve("low")[1].bpm_end
    ultra = procedural_bgm_curve("ultra")[1].bpm_end
    assert ultra > low


def test_bgm_unknown_volatility_falls_back_to_medium() -> None:
    fallback = procedural_bgm_curve("space-disco")
    expected = procedural_bgm_curve("medium")
    assert [c.bpm_end for c in fallback] == [c.bpm_end for c in expected]


# ─── Scene graph stub ───────────────────────────────────────────────


def test_scene_graph_has_required_node_types() -> None:
    sg = build_scene_graph_stub(_spec())
    kinds = {c["type"] for c in sg.root["children"]}
    assert kinds == {"ReelStrip", "PaytablePanel", "FeatureOverlay", "AudioLayer"}


def test_scene_graph_carries_feature_list() -> None:
    spec = _spec(features=["free_spins", "hold_and_win", "respin"])
    sg = build_scene_graph_stub(spec)
    overlay = next(c for c in sg.root["children"] if c["type"] == "FeatureOverlay")
    assert overlay["features"] == ["free_spins", "hold_and_win", "respin"]


# ─── End-to-end build ───────────────────────────────────────────────


def test_build_asset_manifest_e2e() -> None:
    spec = _spec()
    manifest = build_asset_manifest(spec)
    assert manifest.gdd_id == spec.game_id
    assert manifest.gdd_hash == spec.canonical_hash()
    assert len(manifest.symbol_assets) == len(spec.symbols)
    assert len(manifest.bgm_curves) == 4
    # Manifest hash is deterministic + non-empty.
    assert len(manifest.manifest_hash()) == 64


def test_build_asset_manifest_deterministic_for_same_gdd() -> None:
    a = build_asset_manifest(_spec())
    b = build_asset_manifest(_spec())
    assert a.manifest_hash() == b.manifest_hash()


def test_build_asset_manifest_hash_changes_with_gdd() -> None:
    a = build_asset_manifest(_spec(theme="jungle"))
    b = build_asset_manifest(_spec(theme="aztec"))
    assert a.manifest_hash() != b.manifest_hash()


def test_write_manifest_yaml_round_trip(tmp_path: Path) -> None:
    spec = _spec()
    manifest = build_asset_manifest(spec)
    out = tmp_path / "asset" / "manifest.json"
    written = write_manifest_yaml(manifest, out)
    assert written == out
    doc = json.loads(out.read_text())
    assert doc["gdd_id"] == spec.game_id
    assert len(doc["symbol_assets"]) == len(spec.symbols)
