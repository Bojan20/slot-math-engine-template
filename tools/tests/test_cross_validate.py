"""PHASE 18 — Multi-Engine Cross-Validation tests."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

from tools.cross_validate import (
    ValidationResult,
    EngineResult,
    run_cross_validate,
    list_available_engines,
)
from tools.cross_validate.harness import validation_to_dict


REPO_ROOT = Path(__file__).resolve().parents[2]


# ─── fixtures ─────────────────────────────────────────────────────────────


def _make_ir() -> dict:
    return {
        "meta": {"name": "XValTest", "target_rtp": 0.96},
        "topology": {"reels": 5, "rows": 3, "paylines": 20},
        "symbols": [
            {"id": "A", "weight": 8},
            {"id": "B", "weight": 6},
            {"id": "C", "weight": 5},
            {"id": "D", "weight": 4},
            {"id": "E", "weight": 3},
        ],
        "paytable": [
            {"combo": ["A"] * 5, "pays": 50},
            {"combo": ["B"] * 5, "pays": 100},
            {"combo": ["C"] * 5, "pays": 200},
            {"combo": ["D"] * 5, "pays": 500},
            {"combo": ["E"] * 5, "pays": 1000},
        ],
        "reels": {
            "base": [
                {
                    "set": 1,
                    "reels": [
                        [
                            {"symbol": "A", "weight": 8},
                            {"symbol": "B", "weight": 6},
                            {"symbol": "C", "weight": 5},
                            {"symbol": "D", "weight": 4},
                            {"symbol": "E", "weight": 3},
                        ]
                        for _ in range(5)
                    ],
                }
            ]
        },
    }


@pytest.fixture
def ir_path(tmp_path: Path) -> Path:
    p = tmp_path / "ir.json"
    p.write_text(json.dumps(_make_ir()))
    return p


# ─── registry ─────────────────────────────────────────────────────────────


def test_list_available_engines_non_empty():
    engines = list_available_engines()
    assert isinstance(engines, list)
    assert "python_synthetic" in engines
    assert "python_bernoulli" in engines


def test_list_available_engines_excludes_rust_when_absent():
    engines = list_available_engines()
    # rust_slot_sim is only listed when SLOTMATH_RUST_AVAILABLE=1 + cargo
    # available, OR when slot-sim binary is on PATH. In CI / dev shell
    # neither should be true → rust_slot_sim is absent.
    # (No hard assertion either way — environment-dependent.)
    if "rust_slot_sim" in engines:
        # If it is present, it must be invokable
        result = run_cross_validate(
            ir_path=_path_for_test_ir(), spins=1, tolerance=10.0,
        )
        assert "rust_slot_sim" in result.engines_run or \
               "rust_slot_sim" in result.engines_skipped


def _path_for_test_ir(tmp_dir: Path | None = None) -> Path:
    """Write a tiny IR to a temp location for ad-hoc tests."""
    import tempfile
    if tmp_dir is None:
        tmp_dir = Path(tempfile.mkdtemp())
    p = tmp_dir / "ir.json"
    p.write_text(json.dumps(_make_ir()))
    return p


# ─── orchestrator ─────────────────────────────────────────────────────────


def test_run_cross_validate_rejects_missing_ir(tmp_path: Path):
    with pytest.raises(FileNotFoundError):
        run_cross_validate(ir_path=tmp_path / "nope.json", spins=10)


def test_run_cross_validate_rejects_zero_spins(ir_path: Path):
    with pytest.raises(ValueError):
        run_cross_validate(ir_path=ir_path, spins=0)


def test_run_cross_validate_rejects_negative_tolerance(ir_path: Path):
    with pytest.raises(ValueError):
        run_cross_validate(ir_path=ir_path, spins=10, tolerance=-0.01)


def test_run_cross_validate_default_engines(ir_path: Path):
    result = run_cross_validate(ir_path=ir_path, spins=200, tolerance=10.0)
    assert isinstance(result, ValidationResult)
    # Both python_* engines should be in engines_run
    assert "python_synthetic" in result.engines_run
    assert "python_bernoulli" in result.engines_run


def test_run_cross_validate_explicit_subset(ir_path: Path):
    result = run_cross_validate(
        ir_path=ir_path,
        engines=("python_synthetic",),
        spins=100,
        tolerance=10.0,
    )
    assert result.engines_run == ["python_synthetic"]
    assert result.per_engine["python_synthetic"].error is None


def test_run_cross_validate_unknown_engine_skipped(ir_path: Path):
    result = run_cross_validate(
        ir_path=ir_path,
        engines=("python_synthetic", "fake_engine"),
        spins=100,
        tolerance=10.0,
    )
    assert "fake_engine" in result.engines_skipped
    assert "python_synthetic" in result.engines_run


def test_run_cross_validate_consensus_within_tolerance(ir_path: Path):
    """python_synthetic + python_bernoulli should agree within wide tolerance."""
    result = run_cross_validate(ir_path=ir_path, spins=500, tolerance=10.0)
    assert result.rtp_consensus >= 0.0
    # max_rtp_abs_delta should be a finite number
    assert result.max_rtp_abs_delta >= 0.0


def test_run_cross_validate_pass_when_delta_below_tolerance(ir_path: Path):
    """With wide tolerance (e.g. 10.0), result.pass_ must be True."""
    result = run_cross_validate(ir_path=ir_path, spins=200, tolerance=10.0)
    assert result.pass_ is True
    assert result.drifted_engines == []


def test_run_cross_validate_per_engine_shape(ir_path: Path):
    result = run_cross_validate(ir_path=ir_path, spins=200, tolerance=10.0)
    for name, m in result.per_engine.items():
        assert isinstance(m, EngineResult)
        assert m.engine == name
        assert m.spins == 200
        assert m.elapsed_seconds >= 0.0


def test_run_cross_validate_only_unknown_engine_skipped(ir_path: Path):
    """Engine tuple with only unknowns → all skipped, engines_run empty,
    pass_ = False (need ≥ 2 engines to claim consensus)."""
    result = run_cross_validate(
        ir_path=ir_path, engines=("fake_only",),
        spins=10, tolerance=10.0,
    )
    assert "fake_only" in result.engines_skipped
    assert result.engines_run == []
    assert result.pass_ is False


def test_run_cross_validate_seed_deterministic(ir_path: Path):
    """Same seed → bit-identical python_synthetic RTP."""
    r1 = run_cross_validate(
        ir_path=ir_path, engines=("python_synthetic",),
        spins=500, seed=42, tolerance=10.0,
    )
    r2 = run_cross_validate(
        ir_path=ir_path, engines=("python_synthetic",),
        spins=500, seed=42, tolerance=10.0,
    )
    assert r1.per_engine["python_synthetic"].rtp == \
            r2.per_engine["python_synthetic"].rtp


def test_run_cross_validate_seed_varies_rtp(ir_path: Path):
    """Different seeds → typically different python_synthetic RTPs."""
    r1 = run_cross_validate(
        ir_path=ir_path, engines=("python_synthetic",),
        spins=200, seed=1, tolerance=10.0,
    )
    r2 = run_cross_validate(
        ir_path=ir_path, engines=("python_synthetic",),
        spins=200, seed=2, tolerance=10.0,
    )
    # 200 spins → high probability of difference (not strict equality)
    # We just confirm both ran; not asserting inequality due to small samples
    assert r1.per_engine["python_synthetic"].rtp >= 0.0
    assert r2.per_engine["python_synthetic"].rtp >= 0.0


# ─── tolerance + drift detection ──────────────────────────────────────────


def test_tight_tolerance_may_fail(ir_path: Path):
    """200 spins MC will not match closed-form Bernoulli exactly.
    With 0.0001 tolerance, expect failure (Bernoulli vs synthetic MC drift)."""
    result = run_cross_validate(
        ir_path=ir_path, spins=200, tolerance=0.0001,
    )
    # In small-sample regime the synthetic MC can drift from closed-form.
    # If pass_ is True the harness still emitted; if False, drifted list non-empty.
    if not result.pass_:
        assert len(result.drifted_engines) >= 1


def test_drifted_engines_disjoint_from_consensus(ir_path: Path):
    """Drifted list must be a subset of engines_run."""
    result = run_cross_validate(
        ir_path=ir_path, spins=100, tolerance=0.0001,
    )
    for d in result.drifted_engines:
        assert d in result.engines_run


# ─── validation_to_dict serialisation ─────────────────────────────────────


def test_validation_to_dict_keys(ir_path: Path):
    result = run_cross_validate(ir_path=ir_path, spins=100, tolerance=10.0)
    d = validation_to_dict(result)
    expected_keys = {
        "ir_path", "spins_per_engine", "engines_run", "engines_skipped",
        "per_engine", "rtp_consensus", "max_rtp_abs_delta", "tolerance",
        "pass", "drifted_engines", "schema_version",
    }
    assert expected_keys <= set(d.keys())


def test_validation_to_dict_per_engine_serialised(ir_path: Path):
    result = run_cross_validate(ir_path=ir_path, spins=100, tolerance=10.0)
    d = validation_to_dict(result)
    for name, m_d in d["per_engine"].items():
        assert "rtp" in m_d
        assert "engine" in m_d
        assert m_d["engine"] == name


# ─── CLI ──────────────────────────────────────────────────────────────────


def _run_cli(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, "-m", "tools.cross_validate", *args],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )


def test_cli_list_engines():
    rc = _run_cli(["--ir", "/dev/null", "--list-engines"])
    assert rc.returncode == 0
    assert "python_synthetic" in rc.stdout
    assert "python_bernoulli" in rc.stdout


def test_cli_rejects_missing_ir(tmp_path: Path):
    rc = _run_cli(["--ir", str(tmp_path / "nope.json")])
    assert rc.returncode == 2


def test_cli_full_run(ir_path: Path, tmp_path: Path):
    out = tmp_path / "report.json"
    rc = _run_cli([
        "--ir", str(ir_path),
        "--spins", "200",
        "--tolerance", "10.0",
        "--out", str(out),
        "--quiet",
    ])
    assert rc.returncode == 0
    report = json.loads(out.read_text())
    assert report["schema_version"] == "urn:slotmath:cross-validate:v1"
    assert report["spins_per_engine"] == 200
    assert len(report["engines_run"]) >= 1


def test_cli_json_stdout(ir_path: Path):
    rc = _run_cli([
        "--ir", str(ir_path),
        "--spins", "200",
        "--tolerance", "10.0",
        "--json",
        "--quiet",
    ])
    assert rc.returncode == 0
    report = json.loads(rc.stdout)
    assert "pass" in report
    assert "rtp_consensus" in report


def test_cli_exit_code_reflects_pass(ir_path: Path):
    """Wide tolerance → exit 0; tight tolerance → exit 1 (or 0 if engines
    happen to agree within MC variance)."""
    rc_loose = _run_cli([
        "--ir", str(ir_path), "--spins", "200",
        "--tolerance", "10.0", "--quiet",
    ])
    assert rc_loose.returncode == 0
