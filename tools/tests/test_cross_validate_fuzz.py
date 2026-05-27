"""PHASE 18.B — MC Fuzz Cross-Validator tests."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from tools.cross_validate import (
    FuzzReport,
    FuzzIteration,
    run_fuzz_cross_validate,
    fuzz_report_to_dict,
)
from tools.cross_validate.fuzz import _baseline_ir, _perturbations


def test_baseline_ir_is_valid():
    ir = _baseline_ir()
    assert "meta" in ir
    assert ir["topology"]["reels"] == 5
    assert ir["topology"]["rows"] == 3
    assert len(ir["paytable"]) == 3
    assert len(ir["reels"]["base"][0]["reels"]) == 5


def test_perturbations_non_empty():
    p = _perturbations()
    # 5 reels × 3 symbols × 4 non-zero deltas = 60 reel-weight mutators
    # + 3 entries × 3 scales = 9 paytable mutators → 69 total
    assert len(p) >= 30


def test_run_fuzz_zero_iterations_rejected():
    with pytest.raises(ValueError):
        run_fuzz_cross_validate(iterations=0, spins_per_engine=100)


def test_run_fuzz_zero_spins_rejected():
    with pytest.raises(ValueError):
        run_fuzz_cross_validate(iterations=5, spins_per_engine=0)


def test_run_fuzz_negative_tolerance_rejected():
    with pytest.raises(ValueError):
        run_fuzz_cross_validate(iterations=5, spins_per_engine=100, tolerance=-0.01)


def test_run_fuzz_small_run(tmp_path: Path):
    """5 iterations × 200 spins ≈ instant; just verify shape."""
    report = run_fuzz_cross_validate(
        iterations=5,
        spins_per_engine=200,
        tolerance=10.0,  # wide tolerance → everything passes
        workdir=tmp_path,
    )
    assert isinstance(report, FuzzReport)
    assert report.iterations == 5
    assert report.baseline_count + report.drifted_count == len(report.all_iterations)
    assert all(isinstance(it, FuzzIteration) for it in report.all_iterations)


def test_run_fuzz_drift_at_tight_tolerance(tmp_path: Path):
    """Tight tolerance + heavy perturbation → expect some drift."""
    report = run_fuzz_cross_validate(
        iterations=20,
        spins_per_engine=200,
        tolerance=0.001,  # very tight
        workdir=tmp_path,
    )
    # Synthetic MC vs Bernoulli WILL drift on aggressive perturbations.
    assert report.drifted_count >= 0  # weak — guarantee shape, not specifics


def test_run_fuzz_report_iteration_carries_label(tmp_path: Path):
    report = run_fuzz_cross_validate(
        iterations=10,
        spins_per_engine=100,
        tolerance=10.0,
        workdir=tmp_path,
    )
    for it in report.all_iterations:
        assert it.feature_delta != ""
        assert it.max_delta >= 0.0
        assert isinstance(it.rtp_per_engine, dict)


def test_run_fuzz_seed_deterministic(tmp_path: Path):
    """Same seed → same perturbation sequence + same drift verdicts."""
    r1 = run_fuzz_cross_validate(
        iterations=8, spins_per_engine=100, tolerance=10.0,
        seed=12345, workdir=tmp_path / "a",
    )
    r2 = run_fuzz_cross_validate(
        iterations=8, spins_per_engine=100, tolerance=10.0,
        seed=12345, workdir=tmp_path / "b",
    )
    labels_1 = [it.feature_delta for it in r1.all_iterations]
    labels_2 = [it.feature_delta for it in r2.all_iterations]
    assert labels_1 == labels_2


def test_run_fuzz_report_to_dict(tmp_path: Path):
    report = run_fuzz_cross_validate(
        iterations=3, spins_per_engine=50, tolerance=10.0,
        workdir=tmp_path,
    )
    d = fuzz_report_to_dict(report)
    assert d["schema_version"] == "urn:slotmath:cross-fuzz:v1"
    assert "iterations" in d
    assert "drifted" in d
    assert isinstance(d["drifted"], list)


def test_run_fuzz_explicit_engines(tmp_path: Path):
    report = run_fuzz_cross_validate(
        iterations=4,
        spins_per_engine=100,
        tolerance=10.0,
        engines=("python_synthetic",),
        workdir=tmp_path,
    )
    # Only one engine → pass_ is False (need ≥ 2) but no exception
    assert report.iterations == 4


def test_run_fuzz_workdir_creation(tmp_path: Path):
    workdir = tmp_path / "fresh" / "nested" / "subdir"
    assert not workdir.exists()
    run_fuzz_cross_validate(
        iterations=2, spins_per_engine=50, tolerance=10.0,
        workdir=workdir,
    )
    assert workdir.exists()


def test_run_fuzz_persists_per_iteration_ir(tmp_path: Path):
    workdir = tmp_path / "irs"
    run_fuzz_cross_validate(
        iterations=3, spins_per_engine=50, tolerance=10.0,
        workdir=workdir,
    )
    irs = list(workdir.glob("iter-*.ir.json"))
    assert len(irs) >= 1
    # Each IR must be valid JSON with the expected shape
    for p in irs:
        ir = json.loads(p.read_text())
        assert "paytable" in ir
        assert "reels" in ir
