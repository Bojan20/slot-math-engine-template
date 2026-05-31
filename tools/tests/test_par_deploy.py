"""SLOT-MATH Faza 4.9 + 5 — auto-deploy + promote test gate."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.par_deploy import (
    JURISDICTIONS,
    build_deploy_attestation,
    clamp_rtp_for_jurisdiction,
    copy_skin_assets,
    default_asset_manifest,
    emit_rgs_bundle,
    emit_web_bundle,
    render_fastify_server,
    render_index_html,
    write_attestation_chain,
    promote_variant,
    audit_log_entry,
)
from tools.par_deploy.attestation_chain import (
    utc_now_iso,
    verify_attestation_chain,
)
from tools.par_deploy.jurisdiction import (
    all_jurisdictions_for_ir,
    validate_ir_against_jurisdiction,
)
from tools.par_deploy.promote import rollback_to_canary
from tools.par_deploy.web_emit import bundle_sha256


def _synthetic_ir() -> dict:
    return {
        "schema_version": "1.0.0",
        "meta": {"id": "test-game", "name": "Test Game", "version": "1.0.0", "theme_tags": ["test"]},
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "symbols": [
            {"id": "wild", "name": "Wild", "kind": "wild"},
            {"id": "scatter", "name": "Scatter", "kind": "scatter"},
            {"id": "K", "name": "King", "kind": "hp"},
            {"id": "Q", "name": "Queen", "kind": "hp"},
            {"id": "J", "name": "Jack", "kind": "lp"},
        ],
        "reels": {
            "mode": "weighted",
            "base": [{"wild": 1, "scatter": 1, "K": 5, "Q": 8, "J": 10}] * 5,
        },
        "evaluation": {"kind": "lines", "paylines": [[1, 1, 1, 1, 1]], "direction": "ltr", "min_match": 3, "pay_left_to_right_only": True},
        "paytable": {
            "wild": {"3": 50, "4": 100, "5": 500},
            "K": {"3": 20, "4": 50, "5": 200},
            "Q": {"3": 15, "4": 40, "5": 150},
            "J": {"3": 10, "4": 25, "5": 100},
        },
        "features": [{"kind": "free_spins"}],
        "rng": {"kind": "pcg64", "default_seed": 12345},
        "bet": {"currency": "USD", "base_bet": 1.0, "denominations": [0.10, 0.50, 1.0, 5.0]},
        "limits": {"target_rtp": 0.96, "rtp_tolerance": 0.001, "max_win_x": 5000.0, "win_cap_apply": "per_spin", "target_volatility": "medium", "hit_freq_target": 0.25},
        "compliance": {"jurisdictions": ["UKGC", "MGA"], "rtp_range_required": [0.92, 0.98], "max_win_cap_required": 250000.0, "near_miss_rule": "must_be_random", "ldw_disclosure": True, "session_time_display": True},
        "rtp_allocation": {"base_game": 0.70, "free_spins": 0.26, "hold_and_win": 0.0, "jackpot": 0.0, "tolerance": 0.001},
        "provenance": {"vendor": "synthetic", "par_source": "test_v1.par.yaml", "par_sha256": "p" * 64, "ir_sha256": "i" * 64},
    }


# ─── Web emit (Faza 4.1 + 4.2) ──────────────────────────────────────────


def test_render_index_html_includes_meta():
    ir = _synthetic_ir()
    html = render_index_html(ir)
    assert "Test Game" in html
    assert "RTP" in html
    assert "Math Mode" in html
    assert "Cmd+M" in html


def test_emit_web_bundle_writes_three_files(tmp_path: Path):
    ir = _synthetic_ir()
    out = emit_web_bundle(ir, tmp_path)
    web_dir = tmp_path / "web"
    assert (web_dir / "index.html").exists()
    assert (web_dir / "bundle.js").exists()
    assert (web_dir / "game.ir.json").exists()
    assert out["bundle_sha256"] is not None
    assert len(out["bundle_sha256"]) == 64


def test_emit_web_bundle_is_deterministic(tmp_path: Path):
    ir = _synthetic_ir()
    out_a = emit_web_bundle(ir, tmp_path / "a")
    out_b = emit_web_bundle(ir, tmp_path / "b")
    assert out_a["bundle_sha256"] == out_b["bundle_sha256"]


def test_bundle_sha256_changes_when_ir_changes():
    ir1 = _synthetic_ir()
    ir2 = _synthetic_ir()
    ir2["meta"]["name"] = "Different Game"
    html1 = render_index_html(ir1)
    html2 = render_index_html(ir2)
    js = "fake"
    ir1_bytes = json.dumps(ir1, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    ir2_bytes = json.dumps(ir2, sort_keys=True, indent=2).encode("utf-8") + b"\n"
    s1 = bundle_sha256(html1, js, ir1_bytes)
    s2 = bundle_sha256(html2, js, ir2_bytes)
    assert s1 != s2


# ─── RGS emit (Faza 4.3 + 4.4) ──────────────────────────────────────────


def test_render_fastify_server_includes_endpoints():
    src = render_fastify_server()
    assert "/session" in src
    assert "/bet" in src
    assert "/cashout" in src
    assert "/healthz" in src
    assert "/game" in src


def test_emit_rgs_bundle_writes_all_files(tmp_path: Path):
    ir = _synthetic_ir()
    emit_rgs_bundle(ir, tmp_path)
    server_dir = tmp_path / "server"
    for name in ("server.js", "package.json", "Dockerfile", "api.openapi.json", "game.ir.json"):
        assert (server_dir / name).exists(), f"missing {name}"


def test_openapi_lists_known_paths(tmp_path: Path):
    ir = _synthetic_ir()
    emit_rgs_bundle(ir, tmp_path)
    spec = json.loads((tmp_path / "server" / "api.openapi.json").read_text())
    assert spec["openapi"].startswith("3.")
    for p in ("/session", "/bet", "/cashout", "/healthz", "/game"):
        assert p in spec["paths"]


# ─── Assets (Faza 4.5) ──────────────────────────────────────────────────


def test_default_asset_manifest_lists_all_symbols():
    ir = _synthetic_ir()
    manifest = default_asset_manifest(ir)
    assert manifest["schema"] == "slot-math-asset-manifest/v1"
    assert len(manifest["symbols"]) == len(ir["symbols"])
    glyph_ids = {s["id"] for s in manifest["symbols"]}
    assert "wild" in glyph_ids


def test_copy_skin_assets_emits_manifest_even_without_skin(tmp_path: Path):
    ir = _synthetic_ir()
    result = copy_skin_assets(None, tmp_path, ir)
    assert (tmp_path / "web" / "assets" / "manifest.json").exists()
    assert result["skin_source"] == "default-text-glyph"


def test_copy_skin_assets_copies_files_from_dir(tmp_path: Path):
    ir = _synthetic_ir()
    skin = tmp_path / "skin"
    skin.mkdir()
    (skin / "wild.png").write_bytes(b"\x89PNG\r\n\x1a\nFAKE")
    (skin / "subdir").mkdir()
    (skin / "subdir" / "scatter.svg").write_text("<svg/>")
    result = copy_skin_assets(skin, tmp_path / "out", ir)
    assets = tmp_path / "out" / "web" / "assets"
    assert (assets / "wild.png").exists()
    assert (assets / "subdir" / "scatter.svg").exists()
    assert (assets / "manifest.json").exists()
    assert result["file_count"] >= 3


# ─── Jurisdiction (Faza 4.8) ────────────────────────────────────────────


def test_all_6_jurisdictions_defined():
    expected = {"UKGC", "MGA", "GLI-19", "QC-RACJ", "DGOJ", "KSA", "GENERIC"}
    assert set(JURISDICTIONS.keys()) == expected


def test_ukgc_requires_csprng():
    assert JURISDICTIONS["UKGC"].crypto_rng_required is True
    assert JURISDICTIONS["UKGC"].rtp_min == 0.92


def test_clamp_rtp_in_range():
    assert clamp_rtp_for_jurisdiction(0.96, "UKGC") == 0.96
    assert clamp_rtp_for_jurisdiction(0.85, "UKGC") == 0.92  # clamped to min
    assert clamp_rtp_for_jurisdiction(0.99, "UKGC") == 0.98  # clamped to max


def test_validate_ir_clean_for_ukgc():
    ir = _synthetic_ir()
    ir["rng"]["kind"] = "chacha20"  # UKGC needs CSPRNG
    issues = validate_ir_against_jurisdiction(ir, "UKGC")
    assert issues == []


def test_validate_ir_catches_non_crypto_for_ukgc():
    ir = _synthetic_ir()
    # default pcg64 from fixture — fails UKGC
    issues = validate_ir_against_jurisdiction(ir, "UKGC")
    assert any("CSPRNG" in i for i in issues)


def test_validate_ir_catches_overbet_for_ukgc():
    ir = _synthetic_ir()
    ir["rng"]["kind"] = "chacha20"
    ir["bet"]["base_bet"] = 10.0  # over £5 cap
    issues = validate_ir_against_jurisdiction(ir, "UKGC")
    assert any("base_bet" in i for i in issues)


def test_all_jurisdictions_for_ir():
    ir = _synthetic_ir()
    assert all_jurisdictions_for_ir(ir) == ["UKGC", "MGA"]


# ─── Attestation chain (Faza 4.7) ───────────────────────────────────────


def test_deploy_signature_is_deterministic():
    a = build_deploy_attestation(
        "g", "v", "p" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64,
        jurisdiction_codes=["UKGC", "MGA"], mc_tier="T3",
    )
    b = build_deploy_attestation(
        "g", "v", "p" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64,
        jurisdiction_codes=["MGA", "UKGC"],  # different order
        mc_tier="T3",
    )
    # Sorted jurisdictions → same signature
    assert a.deploy_signature() == b.deploy_signature()


def test_deploy_signature_changes_when_par_merkle_changes():
    a = build_deploy_attestation("g", "v", "p" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64)
    b = build_deploy_attestation("g", "v", "X" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64)
    assert a.deploy_signature() != b.deploy_signature()


def test_write_attestation_chain_emits_all_files(tmp_path: Path):
    att = build_deploy_attestation(
        "g", "v", "p" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64,
        jurisdiction_codes=["UKGC"],
    )
    result = write_attestation_chain(att, tmp_path)
    att_dir = tmp_path / "attestation"
    for name in ("par.merkle", "ir.merkle", "mc_sweep.merkle", "bundle.merkle",
                 "kernel.merkle", "deploy.signature.sha256", "chain.json"):
        assert (att_dir / name).exists(), f"missing {name}"
    assert result["deploy_signature_sha256"] == att.deploy_signature()


def test_verify_attestation_chain_pass(tmp_path: Path):
    att = build_deploy_attestation(
        "g", "v", "p" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64,
    )
    write_attestation_chain(att, tmp_path)
    ok, issues = verify_attestation_chain(tmp_path / "attestation")
    assert ok
    assert issues == []


def test_verify_attestation_chain_detects_tamper(tmp_path: Path):
    att = build_deploy_attestation(
        "g", "v", "p" * 64, "i" * 64, "m" * 64, "b" * 64, "k" * 64,
    )
    write_attestation_chain(att, tmp_path)
    # Tamper with par.merkle
    (tmp_path / "attestation" / "par.merkle").write_text("Z" * 64 + "\n")
    # chain.json still has original — signature still matches chain.json
    # But signature must match chain.json contents:
    # Tamper with chain.json instead
    chain = json.loads((tmp_path / "attestation" / "chain.json").read_text())
    chain["stages"]["par_merkle_sha256"] = "Z" * 64
    (tmp_path / "attestation" / "chain.json").write_text(
        json.dumps(chain, sort_keys=True, indent=2) + "\n"
    )
    ok, issues = verify_attestation_chain(tmp_path / "attestation")
    assert not ok
    assert any("mismatch" in i for i in issues)


def test_utc_now_iso_format():
    s = utc_now_iso()
    assert s.endswith("Z")
    assert "T" in s
    assert len(s) == 20  # YYYY-MM-DDTHH:MM:SSZ


# ─── Promote (Faza 5.3) ─────────────────────────────────────────────────


def test_promote_variant_copies_to_live(tmp_path: Path):
    games_root = tmp_path / "games"
    variant_dir = games_root / "game-x" / "variant-c"
    variant_dir.mkdir(parents=True)
    (variant_dir / "marker.txt").write_text("variant-c")

    result = promote_variant(
        games_root, "game-x", "variant-c",
        promoter="bojan@example.com",
        deploy_signature="abc123",
    )
    live_dir = games_root / "game-x" / "live"
    assert live_dir.exists()
    assert (live_dir / "marker.txt").read_text() == "variant-c"
    assert (live_dir / "variant_id.txt").read_text().strip() == "variant-c"
    audit = (games_root / "game-x" / "promotions.log").read_text()
    assert "variant-c" in audit
    assert "bojan@example.com" in audit


def test_promote_moves_prior_live_to_canary(tmp_path: Path):
    games_root = tmp_path / "games"
    for v in ("variant-a", "variant-b"):
        d = games_root / "game-x" / v
        d.mkdir(parents=True)
        (d / "marker.txt").write_text(v)

    # First promote → live = variant-a
    promote_variant(games_root, "game-x", "variant-a", "u@x", "sig-a")
    # Second promote → live = variant-b, canary = variant-a
    result = promote_variant(games_root, "game-x", "variant-b", "u@x", "sig-b")

    live = games_root / "game-x" / "live"
    canary = games_root / "game-x" / "canary"
    assert (live / "marker.txt").read_text() == "variant-b"
    assert (canary / "marker.txt").read_text() == "variant-a"
    assert result["prev_live_variant"] == "variant-a"


def test_promote_rejects_unknown_variant(tmp_path: Path):
    games_root = tmp_path / "games"
    (games_root / "game-x").mkdir(parents=True)
    with pytest.raises(FileNotFoundError):
        promote_variant(games_root, "game-x", "ghost", "u@x", "sig")


def test_rollback_to_canary_swaps(tmp_path: Path):
    games_root = tmp_path / "games"
    for v in ("variant-a", "variant-b"):
        d = games_root / "game-x" / v
        d.mkdir(parents=True)
        (d / "marker.txt").write_text(v)

    promote_variant(games_root, "game-x", "variant-a", "u@x", "sig-a")
    promote_variant(games_root, "game-x", "variant-b", "u@x", "sig-b")
    # Live = variant-b, canary = variant-a → rollback
    result = rollback_to_canary(games_root, "game-x", "u@x")

    live = games_root / "game-x" / "live"
    canary = games_root / "game-x" / "canary"
    assert (live / "marker.txt").read_text() == "variant-a"
    assert (canary / "marker.txt").read_text() == "variant-b"
    assert result["live_variant"] == "variant-a"


# ─── End-to-end ─────────────────────────────────────────────────────────


def test_e2e_full_deploy_pipeline(tmp_path: Path):
    """Full pipeline: IR → web bundle + RGS bundle + assets + attestation chain."""
    ir = _synthetic_ir()
    ir["rng"]["kind"] = "chacha20"  # for UKGC compliance

    out = tmp_path / "build"

    web = emit_web_bundle(ir, out)
    emit_rgs_bundle(ir, out)
    copy_skin_assets(None, out, ir)

    att = build_deploy_attestation(
        game_id=ir["meta"]["id"],
        variant_id="variant-c",
        par_merkle=ir["provenance"]["par_sha256"],
        ir_merkle=ir["provenance"]["ir_sha256"],
        mc_sweep_merkle="m" * 64,
        bundle_merkle=web["bundle_sha256"],
        kernel_merkle="k" * 64,
        jurisdiction_codes=ir["compliance"]["jurisdictions"],
        mc_tier="T3",
    )
    write_attestation_chain(att, out)

    # All artefakti present
    assert (out / "web" / "index.html").exists()
    assert (out / "server" / "server.js").exists()
    assert (out / "web" / "assets" / "manifest.json").exists()
    assert (out / "attestation" / "deploy.signature.sha256").exists()

    # Chain verification passes
    ok, issues = verify_attestation_chain(out / "attestation")
    assert ok, issues


def test_audit_log_entry_includes_timestamp():
    entry = audit_log_entry(
        game_id="g", variant_id="v",
        deploy_signature="abc",
        promoter="u@x",
    )
    assert entry.timestamp_utc.endswith("Z")
    assert entry.deploy_signature == "abc"
