"""W7.11 — Unified Audit Pipeline tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.gdd_asset_pipeline.pipeline import GddSpec
from tools.symbolic_slot_math.model import RtpModel
from tools.unified_pipeline.pipeline import (
    UnifiedAuditConfig,
    run_unified_pipeline,
    write_unified_report,
    _synthesize_spins,
)


def _classic_rtp_model() -> RtpModel:
    return RtpModel(
        n_reels=5,
        n_symbols=2,
        paytable=[[1.0, 4.0, 10.0], []],
        min_match=3,
        paylines=20,
        anchor=0,
        weights=[[4.0, 6.0] for _ in range(5)],
    )


def _classic_gdd() -> GddSpec:
    return GddSpec(
        game_id="UNIT-TEST",
        name="Test Slot",
        theme="jungle",
        mood="epic",
        volatility_class="high",
        symbols=["A", "B", "C", "Wild", "Scatter"],
        features=["free_spins", "hold_and_win"],
    )


def _classic_cfg(**overrides) -> UnifiedAuditConfig:
    defaults = dict(
        gdd=_classic_gdd(),
        rtp_model=_classic_rtp_model(),
        n_genome_population=8,
        n_genome_generations=3,
        n_genome_seed=42,
        target_rtp_pct=20.224,
        target_cv=8.0,
        target_hit_freq=0.27,
        n_rl_players=2,
        n_rl_sessions=2,
        rl_seed=7,
        n_session_mesh_spins=8,
        session_id="test-session",
    )
    defaults.update(overrides)
    return UnifiedAuditConfig(**defaults)


# ─── Synthesize spins ───────────────────────────────────────────────


def test_synthesize_spins_produces_n_records() -> None:
    cfg = _classic_cfg(n_session_mesh_spins=12)
    spins = _synthesize_spins(cfg)
    assert len(spins) == 12
    for i, s in enumerate(spins):
        assert s["nonce"] == i
        assert isinstance(s["server_seed_hex"], str)
        assert len(s["server_seed_hex"]) == 64
        assert s["client_seed"].startswith("client-")
        assert "reel_stops" in s["outcome"]


def test_synthesize_spins_is_deterministic_for_session_id() -> None:
    a = _synthesize_spins(_classic_cfg(session_id="abc"))
    b = _synthesize_spins(_classic_cfg(session_id="abc"))
    assert a == b


def test_synthesize_spins_differs_for_different_session_id() -> None:
    a = _synthesize_spins(_classic_cfg(session_id="abc"))
    b = _synthesize_spins(_classic_cfg(session_id="xyz"))
    assert a[0]["server_seed_hex"] != b[0]["server_seed_hex"]


# ─── run_unified_pipeline ───────────────────────────────────────────


def test_unified_pipeline_produces_all_hashes() -> None:
    report = run_unified_pipeline(_classic_cfg())
    for attr in [
        "gdd_hash",
        "asset_manifest_hash",
        "derivative_manifest_hash",
        "pareto_hash",
        "rl_kpi_hash",
        "session_mesh_root",
        "js_bundle_sha256",
        "consolidated_hash",
    ]:
        v = getattr(report, attr)
        assert isinstance(v, str)
        assert len(v) == 64


def test_unified_pipeline_consolidated_hash_is_deterministic() -> None:
    a = run_unified_pipeline(_classic_cfg())
    b = run_unified_pipeline(_classic_cfg())
    assert a.consolidated_hash == b.consolidated_hash


def test_unified_pipeline_consolidated_hash_changes_with_gdd() -> None:
    a = run_unified_pipeline(_classic_cfg(gdd=_classic_gdd()))
    other = _classic_gdd()
    other.theme = "aztec"
    b = run_unified_pipeline(_classic_cfg(gdd=other))
    assert a.consolidated_hash != b.consolidated_hash


def test_unified_pipeline_consolidated_hash_changes_with_rtp_model() -> None:
    a = run_unified_pipeline(_classic_cfg())
    other_model = _classic_rtp_model()
    other_model.weights[0][0] = 7.0
    b = run_unified_pipeline(_classic_cfg(rtp_model=other_model))
    assert a.consolidated_hash != b.consolidated_hash


def test_unified_pipeline_consolidated_hash_changes_with_seed() -> None:
    a = run_unified_pipeline(_classic_cfg(n_genome_seed=42))
    b = run_unified_pipeline(_classic_cfg(n_genome_seed=43))
    # Genome Pareto frontier depends on seed → pareto_hash differs →
    # consolidated_hash differs.
    assert a.consolidated_hash != b.consolidated_hash


def test_unified_pipeline_consolidated_hash_changes_with_session_id() -> None:
    a = run_unified_pipeline(_classic_cfg(session_id="alpha"))
    b = run_unified_pipeline(_classic_cfg(session_id="beta"))
    assert a.session_mesh_root != b.session_mesh_root
    assert a.consolidated_hash != b.consolidated_hash


def test_unified_pipeline_pareto_summary_non_empty() -> None:
    report = run_unified_pipeline(_classic_cfg())
    assert len(report.pareto_summary) >= 1
    for m in report.pareto_summary:
        assert "rtp" in m
        assert "cv" in m
        assert "hit_freq" in m
        assert "fitness" in m


def test_unified_pipeline_rl_kpi_has_archetype_and_sessions() -> None:
    cfg = _classic_cfg(n_rl_players=3, n_rl_sessions=2)
    report = run_unified_pipeline(cfg)
    assert report.rl_kpi["archetype"] == "casual"
    assert report.rl_kpi["sessions"] == 6


def test_unified_pipeline_asset_manifest_brief_counts_symbols() -> None:
    report = run_unified_pipeline(_classic_cfg())
    brief = report.asset_manifest_brief
    assert brief["n_symbol_assets"] == 5  # gdd has 5 symbols
    assert brief["n_bgm_curves"] == 4


# ─── write_unified_report ───────────────────────────────────────────


def test_write_unified_report_round_trip(tmp_path: Path) -> None:
    report = run_unified_pipeline(_classic_cfg())
    out = tmp_path / "unified.json"
    written = write_unified_report(report, out)
    assert written == out
    doc = json.loads(out.read_text())
    assert doc["consolidated_hash"] == report.consolidated_hash
    assert len(doc["pareto_summary"]) == len(report.pareto_summary)


# ─── CLI smoke ──────────────────────────────────────────────────────


def test_cli_unified_pipeline_e2e(tmp_path: Path) -> None:
    from tools.unified_pipeline.__main__ import main as cli_main  # noqa: PLC0415
    out = tmp_path / "u.json"
    rc = cli_main([
        "--gdd-id", "CLI-TEST",
        "--gdd-symbols", "Tiger,Lotus,Bamboo",
        "--gdd-features", "free_spins",
        "--population", "8",
        "--generations", "2",
        "--rl-players", "2",
        "--rl-sessions", "2",
        "--n-mesh-spins", "4",
        "--out", str(out),
    ])
    assert rc == 0
    doc = json.loads(out.read_text())
    assert doc["consolidated_hash"]
    assert doc["asset_manifest_brief"]["n_symbol_assets"] == 3


# ─── Integration: hash interleaving sanity ──────────────────────────


def test_consolidated_hash_function_is_sensitive_to_each_sub_hash() -> None:
    """Modify each sub-input one at a time and ensure consolidated_hash
    moves. Confirms the audit commitment actually depends on every
    W7.x kernel's output, not just one or two."""
    base = run_unified_pipeline(_classic_cfg())

    # 1. Modify GDD theme → asset manifest hash + gdd hash both move.
    g2 = _classic_gdd(); g2.theme = "noir"
    a = run_unified_pipeline(_classic_cfg(gdd=g2))
    assert a.consolidated_hash != base.consolidated_hash

    # 2. Modify rtp_model weight → derivative + pareto hashes both move.
    m2 = _classic_rtp_model(); m2.weights[2][1] = 1.0
    b = run_unified_pipeline(_classic_cfg(rtp_model=m2))
    assert b.consolidated_hash != base.consolidated_hash

    # 3. Modify RL seed → rl_kpi_hash moves.
    c = run_unified_pipeline(_classic_cfg(rl_seed=base.rl_kpi["sessions"] + 999))
    assert c.consolidated_hash != base.consolidated_hash

    # 4. Modify session id → session_mesh_root moves.
    d = run_unified_pipeline(_classic_cfg(session_id="other"))
    assert d.consolidated_hash != base.consolidated_hash
