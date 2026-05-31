"""SLOT-MATH Faza 2.6 — PAR → IR mapper test gate."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.par_to_ir.map import (
    SCHEMA_VERSION,
    attach_ir_merkle,
    ir_merkle_sha256,
    map_par_to_ir,
)
from tools.par_to_ir.validate import IrValidationError, validate_ir, validate_par_coverage
from tools.par_to_ir.dispatcher import attach_kernel_composition, dispatch_kernels
from tools.par_to_ir.rng_bind import (
    CRYPTO_RNG,
    DEFAULT_RNG,
    bind_rng_profile,
    required_rng_for_jurisdictions,
)


REPO = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = REPO / "reports" / "schemas" / "game_ir.schema.json"


# ─── Synthetic PAR fixtures ─────────────────────────────────────────────


def _minimal_par() -> dict:
    return {
        "schema": "slot-math-canonical-par/v1",
        "merkle_root_sha256": "a" * 64,
        "meta": {
            "id": "test-game",
            "name": "Test Game",
            "version": "1.0.0",
            "theme_tags": ["fantasy"],
        },
        "topology": {"kind": "rectangular", "reels": 5, "rows": 3},
        "symbols": [
            {"id": "wild", "name": "Wild", "kind": "wild", "substitutes": "*"},
            {"id": "scatter", "name": "Scatter", "kind": "scatter"},
            {"id": "K", "name": "King", "kind": "hp"},
            {"id": "Q", "name": "Queen", "kind": "hp"},
            {"id": "J", "name": "Jack", "kind": "lp"},
            {"id": "T", "name": "Ten", "kind": "lp"},
        ],
        "reels": {
            "mode": "weighted",
            "base": [
                {"wild": 1, "scatter": 1, "K": 5, "Q": 8, "J": 10, "T": 12},
                {"wild": 1, "scatter": 1, "K": 5, "Q": 8, "J": 10, "T": 12},
                {"wild": 1, "scatter": 1, "K": 5, "Q": 8, "J": 10, "T": 12},
                {"wild": 1, "scatter": 1, "K": 5, "Q": 8, "J": 10, "T": 12},
                {"wild": 1, "scatter": 1, "K": 5, "Q": 8, "J": 10, "T": 12},
            ],
        },
        "evaluation": {
            "kind": "lines",
            "paylines": [[1, 1, 1, 1, 1]],
            "direction": "ltr",
            "min_match": 3,
            "pay_left_to_right_only": True,
        },
        "paytable": {
            "wild": {"3": 50, "4": 100, "5": 500},
            "K": {"3": 20, "4": 50, "5": 200},
            "Q": {"3": 15, "4": 40, "5": 150},
            "J": {"3": 10, "4": 25, "5": 100},
            "T": {"3": 5, "4": 15, "5": 75},
        },
        "features": [
            {
                "kind": "free_spins",
                "trigger": {"by": "scatter_count", "thresholds": {"3": 10}},
            }
        ],
        "rtp": {
            "rtp_total": 0.965,
            "base_game": 0.70,
            "free_spins": 0.265,
            "tolerance": 0.001,
        },
        "rng_profile": {"kind": "pcg64", "default_seed": 12345},
        "source": {
            "vendor": "synthetic",
            "format": "yaml",
            "filename": "minimal_test.par.yaml",
            "sha256": "b" * 64,
        },
    }


def _cluster_par() -> dict:
    par = _minimal_par()
    par["meta"]["id"] = "cluster-game"
    par["topology"] = {"kind": "cluster_grid", "columns": 6, "rows": 5, "adjacency": "orthogonal"}
    par["evaluation"] = {
        "kind": "cluster",
        "min_cluster_size": 5,
        "cluster_pay_table": {"5": 10, "6": 20, "7": 50, "8+": 100},
    }
    par["features"] = [{"kind": "cascade", "replacement": "drop", "max_chain": 10}]
    return par


def _ukgc_par() -> dict:
    par = _minimal_par()
    par["meta"]["id"] = "uk-game"
    par["compliance"] = {
        "jurisdictions": ["UKGC", "MGA"],
        "rtp_range_required": [0.92, 0.98],
        "max_win_cap_required": 250_000,
        "near_miss_rule": "must_be_random",
        "ldw_disclosure": True,
        "session_time_display": True,
    }
    return par


# ─── map_par_to_ir ──────────────────────────────────────────────────────


def test_map_minimal_par_produces_valid_ir():
    ir = map_par_to_ir(_minimal_par())
    assert ir["schema_version"] == SCHEMA_VERSION
    assert ir["meta"]["id"] == "test-game"
    assert ir["topology"]["kind"] == "rectangular"
    assert ir["topology"]["reels"] == 5
    assert len(ir["symbols"]) == 6
    assert ir["reels"]["mode"] == "weighted"
    assert ir["paytable"]["wild"]["5"] == 500.0
    assert ir["limits"]["target_rtp"] == 0.965
    validate_ir(ir)  # must pass


def test_map_cluster_topology():
    ir = map_par_to_ir(_cluster_par())
    assert ir["topology"]["kind"] == "cluster_grid"
    assert ir["topology"]["adjacency"] == "orthogonal"
    assert ir["evaluation"]["kind"] == "cluster"
    validate_ir(ir)


def test_map_preserves_substitutes_wildcard():
    ir = map_par_to_ir(_minimal_par())
    wild_sym = next(s for s in ir["symbols"] if s["id"] == "wild")
    assert wild_sym["substitutes"] == "*"


def test_map_rejects_unknown_schema():
    par = _minimal_par()
    par["schema"] = "slot-math-canonical-par/v999"
    with pytest.raises(ValueError, match="unsupported PAR schema"):
        map_par_to_ir(par)


def test_map_provenance_includes_merkle():
    ir = map_par_to_ir(_minimal_par())
    assert ir["provenance"]["par_sha256"] == "b" * 64
    assert ir["provenance"]["vendor"] == "synthetic"


def test_ir_merkle_is_deterministic():
    ir1 = map_par_to_ir(_minimal_par())
    ir2 = map_par_to_ir(_minimal_par())
    assert ir_merkle_sha256(ir1) == ir_merkle_sha256(ir2)


def test_attach_ir_merkle_stamps_provenance():
    ir = map_par_to_ir(_minimal_par())
    attach_ir_merkle(ir)
    assert "ir_sha256" in ir["provenance"]
    assert len(ir["provenance"]["ir_sha256"]) == 64


# ─── validate_ir ────────────────────────────────────────────────────────


def test_validate_minimal_ir_passes():
    ir = map_par_to_ir(_minimal_par())
    validate_ir(ir)  # no exception


def test_validate_catches_missing_top_field():
    ir = map_par_to_ir(_minimal_par())
    del ir["paytable"]
    with pytest.raises(IrValidationError, match="paytable"):
        validate_ir(ir)


def test_validate_catches_invalid_rng_kind():
    ir = map_par_to_ir(_minimal_par())
    ir["rng"]["kind"] = "totally_made_up"
    with pytest.raises(IrValidationError, match="ir.rng.kind invalid"):
        validate_ir(ir)


def test_validate_catches_out_of_range_rtp():
    ir = map_par_to_ir(_minimal_par())
    ir["limits"]["target_rtp"] = 1.5
    with pytest.raises(IrValidationError, match="target_rtp out of"):
        validate_ir(ir)


def test_validate_catches_empty_symbols():
    ir = map_par_to_ir(_minimal_par())
    ir["symbols"] = []
    with pytest.raises(IrValidationError, match="symbols must be non-empty"):
        validate_ir(ir)


def test_validate_par_coverage_finds_unconsumed():
    par = _minimal_par()
    par["unknown_extra_field"] = {"foo": "bar"}
    ir = map_par_to_ir(par)
    unconsumed = validate_par_coverage(par, ir)
    assert "unknown_extra_field" in unconsumed


def test_validate_par_coverage_clean_when_complete():
    par = _minimal_par()
    ir = map_par_to_ir(par)
    unconsumed = validate_par_coverage(par, ir)
    # Only metadata-only fields should be uncounted, and even those are filtered out
    assert unconsumed == []


# ─── dispatcher ─────────────────────────────────────────────────────────


def test_dispatch_lines_evaluation_maps_to_asymmetric_paytable():
    ir = map_par_to_ir(_minimal_par())
    comp = dispatch_kernels(ir)
    kernel_ids = [c["kernel_id"] for c in comp]
    assert "asymmetric_paytable" in kernel_ids


def test_dispatch_cluster_evaluation_maps_to_cluster_pays():
    ir = map_par_to_ir(_cluster_par())
    comp = dispatch_kernels(ir)
    kernel_ids = [c["kernel_id"] for c in comp]
    assert "cluster_pays" in kernel_ids


def test_dispatch_free_spins_feature_maps_to_expanding_symbol():
    ir = map_par_to_ir(_minimal_par())
    comp = dispatch_kernels(ir)
    kernel_ids = [c["kernel_id"] for c in comp]
    assert "expanding_symbol" in kernel_ids


def test_dispatch_cascade_feature_maps_to_cascade_kernel():
    ir = map_par_to_ir(_cluster_par())
    comp = dispatch_kernels(ir)
    kernel_ids = [c["kernel_id"] for c in comp]
    assert "cascade" in kernel_ids


def test_dispatch_no_duplicates():
    ir = map_par_to_ir(_minimal_par())
    comp = dispatch_kernels(ir)
    keys = [(c["feature_kind"], c["kernel_id"]) for c in comp]
    assert len(keys) == len(set(keys))


def test_attach_kernel_composition_writes_to_ir():
    ir = map_par_to_ir(_minimal_par())
    attach_kernel_composition(ir)
    assert "kernel_composition" in ir
    assert len(ir["kernel_composition"]) > 0


# ─── RNG bind ───────────────────────────────────────────────────────────


def test_required_rng_for_ukgc_returns_crypto():
    assert required_rng_for_jurisdictions(["UKGC"]) == CRYPTO_RNG
    assert required_rng_for_jurisdictions(["MGA"]) == CRYPTO_RNG


def test_required_rng_for_generic_returns_default():
    assert required_rng_for_jurisdictions(["GENERIC"]) == DEFAULT_RNG
    assert required_rng_for_jurisdictions([]) == DEFAULT_RNG


def test_required_rng_mixed_jurisdictions_uses_strictest():
    # If UKGC is in the mix, crypto wins
    assert required_rng_for_jurisdictions(["GENERIC", "UKGC"]) == CRYPTO_RNG


def test_bind_rng_profile_upgrades_for_ukgc():
    ir = map_par_to_ir(_ukgc_par())
    assert ir["rng"]["kind"] == "pcg64"  # original from PAR
    bind_rng_profile(ir)
    assert ir["rng"]["kind"] == CRYPTO_RNG  # upgraded


def test_bind_rng_profile_force_kind_overrides():
    ir = map_par_to_ir(_minimal_par())
    bind_rng_profile(ir, force_kind="philox4x32")
    assert ir["rng"]["kind"] == "philox4x32"


def test_bind_rng_profile_keeps_default_for_generic():
    ir = map_par_to_ir(_minimal_par())
    bind_rng_profile(ir)
    assert ir["rng"]["kind"] == DEFAULT_RNG


# ─── End-to-end ─────────────────────────────────────────────────────────


def test_e2e_par_to_ir_full_pipeline():
    """Realistic pipeline: PAR → map → validate → dispatch → rng_bind → IR sha256."""
    par = _ukgc_par()
    ir = map_par_to_ir(par)
    validate_ir(ir)
    attach_kernel_composition(ir)
    bind_rng_profile(ir)
    attach_ir_merkle(ir)

    assert ir["rng"]["kind"] == CRYPTO_RNG
    assert "kernel_composition" in ir
    assert ir["provenance"]["ir_sha256"]
    assert validate_par_coverage(par, ir) == []


def test_e2e_pipeline_deterministic_across_runs():
    """Two independent runs of same PAR → identical IR sha256."""
    par = _minimal_par()
    sha_a = None
    sha_b = None
    for _ in range(2):
        ir = map_par_to_ir(par)
        validate_ir(ir)
        attach_kernel_composition(ir)
        bind_rng_profile(ir)
        attach_ir_merkle(ir)
        if sha_a is None:
            sha_a = ir["provenance"]["ir_sha256"]
        else:
            sha_b = ir["provenance"]["ir_sha256"]
    assert sha_a == sha_b


# ─── Schema file presence ───────────────────────────────────────────────


def test_game_ir_schema_file_exists_and_parses():
    assert SCHEMA_PATH.exists(), f"schema missing: {SCHEMA_PATH}"
    payload = json.loads(SCHEMA_PATH.read_text())
    assert payload.get("title") == "Game IR — engine-native runtime spec"
    assert "schema_version" in payload["properties"]
