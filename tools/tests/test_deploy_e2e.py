"""SLOT-MATH Faza 4.9 — End-to-end deploy gate.

Drives the full PAR → IR → MC → deploy pipeline against synthetic
inputs and asserts:

  - Build produces all required artefakti (web/, server/, attestation/, README, manifest)
  - Build is BYTE-DETERMINISTIC when re-run with identical inputs
  - Merkle chain unbroken (par → ir → mc → bundle → deploy signature)
  - Integrity verifier catches tampering
  - Jurisdiction clamp metadata round-trips through manifest
"""
from __future__ import annotations

import json
from pathlib import Path


from tools.par_deploy.assemble import (
    BuildManifest,
    assemble_variant,
    verify_artefact_integrity,
)
from tools.par_deploy.attestation_chain import verify_attestation_chain


# ─── Fixtures ────────────────────────────────────────────────────────────


def _synthetic_par() -> dict:
    return {
        "schema": "slot-math-canonical-par/v1",
        "merkle_root_sha256": "p" * 64,
        "rtp": {"rtp_total": 0.96, "variance": 100.0},
        "limits": {"hit_freq_target": 0.25, "max_win_x": 5000.0},
        "features": [{"kind": "free_spins", "trigger_freq_target": 0.005}],
        "reel_strips": [["A", "K", "Q", "J"]],
        "paytable": {"A": [10, 50, 250], "K": [5, 25, 125]},
    }


def _synthetic_ir() -> dict:
    return {
        "meta": {"id": "e2e-test-game", "name": "E2E Test Game"},
        "limits": {
            "target_rtp": 0.96,
            "hit_freq_target": 0.25,
            "max_win_x": 5000.0,
        },
        "features": [{"kind": "free_spins"}],
        "provenance": {
            "par_source": "fixtures/variant_a.xlsx",
            "ir_sha256": "i" * 64,
        },
        "kernels": [
            {"id": "k_base_lines", "params": {"lines": 20}},
            {"id": "k_free_spins", "params": {"trigger": "scatter_3"}},
        ],
    }


def _synthetic_mc_attestation() -> dict:
    return {
        "schema": "slot-math-mc-attestation/v1",
        "attestation_sha256": "m" * 64,
        "tier": "T3",
        "game_id": "e2e-test-game",
        "variant_id": "variant_a",
    }


# ─── End-to-end build assertions ─────────────────────────────────────────


def test_assemble_produces_all_required_artefacts(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    manifest = assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=tmp_path,
        build_timestamp="2026-01-01T00:00:00Z",
    )
    assert isinstance(manifest, BuildManifest)

    variant_dir = tmp_path / "games" / "e2e-test-game" / "variant_a"
    assert variant_dir.is_dir()

    # Required top-level paths
    for sub in ("web", "server", "attestation", "README.md", "build.manifest.json"):
        assert (variant_dir / sub).exists(), f"missing artefakt: {sub}"

    # Web bundle has the 3 canonical files
    assert (variant_dir / "web" / "index.html").is_file()
    assert (variant_dir / "web" / "game.ir.json").is_file()
    # Either bundle.js (scaffold) or runner pulled from web_emit — at least one .js
    js_files = list((variant_dir / "web").glob("*.js"))
    assert len(js_files) >= 1, "no web bundle JS produced"

    # Server bundle has package.json + Dockerfile
    assert (variant_dir / "server" / "package.json").is_file()
    assert (variant_dir / "server" / "Dockerfile").is_file()

    # Attestation chain has the four merkle stages + signature
    att = variant_dir / "attestation"
    for stage in ("par.merkle", "ir.merkle", "mc_sweep.merkle",
                  "bundle.merkle", "deploy.signature.sha256"):
        assert (att / stage).is_file(), f"missing attestation: {stage}"


def test_assemble_is_byte_deterministic(tmp_path: Path):
    """Same inputs → byte-identical web + server bundles (modulo timestamp)."""
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    out_a = tmp_path / "build_a"
    out_b = tmp_path / "build_b"
    m_a = assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=out_a,
        build_timestamp="2026-01-01T00:00:00Z",
    )
    m_b = assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=out_b,
        build_timestamp="2026-01-01T00:00:00Z",
    )

    assert m_a.web_bundle_sha256 == m_b.web_bundle_sha256
    assert m_a.rgs_bundle_sha256 == m_b.rgs_bundle_sha256
    assert m_a.deploy_merkle_root == m_b.deploy_merkle_root
    assert m_a.deploy_signature == m_b.deploy_signature


def test_merkle_chain_links_par_to_deploy(tmp_path: Path):
    """Deploy signature MUST change if any upstream merkle changes."""
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    m_orig = assemble_variant(
        par=par, ir=ir, mc_attestation=mc,
        out_root=tmp_path / "orig", build_timestamp="t",
    )

    # Tamper with PAR merkle → expect different deploy signature
    par_evil = dict(par)
    par_evil["merkle_root_sha256"] = "x" * 64
    m_tamper = assemble_variant(
        par=par_evil, ir=ir, mc_attestation=mc,
        out_root=tmp_path / "tamper", build_timestamp="t",
    )
    assert m_orig.deploy_signature != m_tamper.deploy_signature, \
        "PAR tampering must propagate to deploy signature"

    # Tamper with MC attestation → different signature
    mc_evil = dict(mc)
    mc_evil["attestation_sha256"] = "y" * 64
    m_mc_tamper = assemble_variant(
        par=par, ir=ir, mc_attestation=mc_evil,
        out_root=tmp_path / "mc_tamper", build_timestamp="t",
    )
    assert m_orig.deploy_signature != m_mc_tamper.deploy_signature, \
        "MC tampering must propagate to deploy signature"


def test_integrity_verifier_catches_post_build_tampering(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    manifest = assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=tmp_path,
        build_timestamp="t",
    )
    variant_dir = tmp_path / "games" / manifest.game_id / manifest.variant_id

    # Clean build should verify
    ok, violations = verify_artefact_integrity(variant_dir)
    assert ok, f"clean build failed verification: {violations}"

    # Tamper with the web bundle
    target = variant_dir / "web" / "index.html"
    target.write_text(target.read_text() + "<!-- TAMPER -->", encoding="utf-8")
    ok, violations = verify_artefact_integrity(variant_dir)
    assert not ok
    assert any("web bundle" in v for v in violations), violations


def test_manifest_round_trip(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    manifest = assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=tmp_path,
        build_timestamp="2026-01-01T00:00:00Z",
        jurisdiction="UKGC",
    )
    variant_dir = tmp_path / "games" / manifest.game_id / manifest.variant_id

    loaded = json.loads((variant_dir / "build.manifest.json").read_text())
    assert loaded["schema"] == "slot-math-build-manifest/v1"
    assert loaded["game_id"] == "e2e-test-game"
    assert loaded["variant_id"] == "variant_a"
    assert loaded["jurisdiction"] == "UKGC"
    assert loaded["par_merkle_sha256"] == "p" * 64
    assert loaded["ir_sha256"] == "i" * 64
    assert loaded["mc_attestation_sha256"] == "m" * 64
    assert len(loaded["deploy_signature"]) == 64
    assert "web" in loaded["artefact_paths"]


def test_attestation_chain_verifies_when_intact(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=tmp_path,
        build_timestamp="t",
    )
    variant_dir = tmp_path / "games" / "e2e-test-game" / "variant_a"
    ok, violations = verify_attestation_chain(variant_dir / "attestation")
    assert ok, f"attestation chain failed: {violations}"


def test_readme_contains_regulator_paper_trail(tmp_path: Path):
    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    manifest = assemble_variant(
        par=par, ir=ir, mc_attestation=mc, out_root=tmp_path,
        build_timestamp="2026-01-01T00:00:00Z",
        jurisdiction="MGA",
    )
    variant_dir = tmp_path / "games" / manifest.game_id / manifest.variant_id
    readme = (variant_dir / "README.md").read_text()

    # README must include every hash so regulator can grep-verify
    assert manifest.par_merkle_sha256 in readme
    assert manifest.ir_sha256 in readme
    assert manifest.mc_attestation_sha256 in readme
    assert manifest.deploy_signature in readme
    assert "MGA" in readme
    assert "Verification" in readme


# ─── Cross-variant determinism ───────────────────────────────────────────


def test_different_variants_produce_different_signatures(tmp_path: Path):
    par = _synthetic_par()
    ir_a = _synthetic_ir()
    ir_b = _synthetic_ir()
    ir_b["provenance"]["par_source"] = "fixtures/variant_b.xlsx"
    ir_b["provenance"]["ir_sha256"] = "j" * 64
    mc = _synthetic_mc_attestation()

    m_a = assemble_variant(par=par, ir=ir_a, mc_attestation=mc,
                           out_root=tmp_path, build_timestamp="t")
    m_b = assemble_variant(par=par, ir=ir_b, mc_attestation=mc,
                           out_root=tmp_path, build_timestamp="t")

    assert m_a.variant_id == "variant_a"
    assert m_b.variant_id == "variant_b"
    assert m_a.deploy_signature != m_b.deploy_signature


# ─── Performance budget ─────────────────────────────────────────────────


def test_assemble_completes_under_budget(tmp_path: Path):
    """Full assemble for one variant should be sub-second for synthetic IR."""
    import time

    par = _synthetic_par()
    ir = _synthetic_ir()
    mc = _synthetic_mc_attestation()

    t0 = time.perf_counter()
    assemble_variant(par=par, ir=ir, mc_attestation=mc, out_root=tmp_path,
                     build_timestamp="t")
    dt = time.perf_counter() - t0
    assert dt < 2.0, f"assemble took {dt:.3f}s — over 2s budget"
