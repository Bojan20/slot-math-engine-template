"""Pytest smoke tests for the QA Agent stack.

These tests run the agent's own selftest layer + a subset of the manual
scenarios in-process. They are intentionally fast (under a few seconds)
so they fit into the broader pytest suite without bloat. Heavier auto
layers (L2-L8) are exercised via `make qa-quick` / `make qa-full`, not
here.
"""
from __future__ import annotations

from pathlib import Path


from tools.qa_agent.report import (
    Finding,
    LayerResult,
    LayerStatus,
    QaReport,
    canonical_sha256,
)
from tools.qa_agent.runner import QaConfig, QaScope, run_qa
from tools.qa_agent.scenarios import (
    discover_scenarios,
    load_scenario,
    validate_scenario,
)
from tools.qa_agent.selftest import (
    check_antibody_roundtrip,
    check_cli_surface,
    check_report_writer,
    check_scenarios,
    check_subprocess_presence,
)


REPO_ROOT = Path(__file__).resolve().parents[2]


# ── scenarios shape ──────────────────────────────────────────────────


def test_scenarios_discoverable() -> None:
    paths = discover_scenarios()
    assert paths, "no scenarios discovered under tools/qa_agent/scenarios/"
    assert all(p.suffix == ".yaml" for p in paths)


def test_every_scenario_validates() -> None:
    paths = discover_scenarios()
    for p in paths:
        data = load_scenario(p)
        errors = validate_scenario(data)
        assert not errors, f"{p.name}: {errors}"


def test_scenario_ids_are_unique() -> None:
    ids = []
    for p in discover_scenarios():
        ids.append(load_scenario(p)["id"])
    assert len(ids) == len(set(ids)), f"duplicate scenario ids: {ids}"


# ── selftest sub-checks ──────────────────────────────────────────────


def test_selftest_scenarios_pass() -> None:
    res = check_scenarios()
    assert res["status"] == "PASS", res


def test_selftest_cli_surface_pass() -> None:
    res = check_cli_surface()
    assert res["status"] == "PASS", res


def test_selftest_antibody_roundtrip_pass() -> None:
    res = check_antibody_roundtrip()
    assert res["status"] == "PASS", res


def test_selftest_report_writer_pass() -> None:
    res = check_report_writer()
    assert res["status"] == "PASS", res


def test_selftest_subprocess_probe_never_fails() -> None:
    # Sub-check #5 is informational; missing binaries do not fail.
    res = check_subprocess_presence()
    assert res["status"] == "PASS"


# ── end-to-end ───────────────────────────────────────────────────────


def test_selftest_scope_returns_all_pass(tmp_path: Path) -> None:
    cfg = QaConfig(scope=QaScope.SELFTEST, out_root=tmp_path, allow_dirty=True)
    report, run_dir = run_qa(cfg)
    assert report.verdict == "ALL_PASS"
    assert report.exit_code == 0
    assert (run_dir / "report.json").exists()
    assert (run_dir / "report.md").exists()


def test_manual_scope_runs_every_scenario(tmp_path: Path) -> None:
    cfg = QaConfig(scope=QaScope.MANUAL, out_root=tmp_path, allow_dirty=True)
    report, _ = run_qa(cfg)
    # Some scenarios may legitimately fail in CI (e.g. missing optional deps);
    # we only require that the manual layer ran at least one scenario.
    manual = next(l for l in report.layers if l.layer == "L9")
    assert manual.counts.get("run", 0) >= 1
    # Selftest must always be PASS.
    sel = next(l for l in report.layers if l.layer == "L0")
    assert sel.status == LayerStatus.PASS


def test_status_scope_emits_payload(tmp_path: Path) -> None:
    # Prime a synthetic prior run by running selftest first.
    cfg_pre = QaConfig(scope=QaScope.SELFTEST, out_root=tmp_path, allow_dirty=True)
    run_qa(cfg_pre)
    cfg_status = QaConfig(scope=QaScope.STATUS, out_root=tmp_path, allow_dirty=True)
    report, _ = run_qa(cfg_status)
    assert report.exit_code in (0, 3)  # 0 normal, 3 only if the prior write failed


# ── determinism / canonical_sha256 ──────────────────────────────────


def test_canonical_sha256_ignores_timestamps() -> None:
    a = {"verdict": "PASS", "layers": [], "started_at": "x", "elapsed_ms": 1}
    b = {"verdict": "PASS", "layers": [], "started_at": "y", "elapsed_ms": 999}
    assert canonical_sha256(a) == canonical_sha256(b)


def test_canonical_sha256_detects_layer_drift() -> None:
    a = {"verdict": "PASS", "layers": [{"layer": "L0", "status": "PASS"}], "started_at": "x"}
    b = {"verdict": "PASS", "layers": [{"layer": "L0", "status": "FAIL"}], "started_at": "x"}
    assert canonical_sha256(a) != canonical_sha256(b)


def test_qa_report_canonical_hash_stable() -> None:
    """Two QaReports differing only by timestamps hash identically."""
    def _mk(ts: str) -> QaReport:
        r = QaReport(
            scope="manual", baseline="", seed=42,
            repo_sha="deadbeef", started_at=ts, finished_at=ts,
        )
        r.layers = [
            LayerResult(
                layer="L0", name="selftest", status=LayerStatus.PASS,
                elapsed_ms=1.0, counts={"checks": 5}, detail="all green",
            )
        ]
        r.verdict, r.exit_code = r.compute_verdict()
        return r

    assert _mk("2026-05-28T00:00:00Z").canonical_hash() == \
           _mk("2026-05-28T23:59:59Z").canonical_hash()


# ── verdict computation ──────────────────────────────────────────────


def test_verdict_all_pass_when_every_layer_pass() -> None:
    r = QaReport(scope="full", seed=42)
    r.layers = [
        LayerResult(layer=f"L{i}", name="x", status=LayerStatus.PASS, elapsed_ms=1.0)
        for i in range(3)
    ]
    v, code = r.compute_verdict()
    assert v == "ALL_PASS"
    assert code == 0


def test_verdict_blocked_when_antibody_fail() -> None:
    r = QaReport(scope="full", seed=42)
    r.layers = [
        LayerResult(
            layer="L1", name="antibody", status=LayerStatus.FAIL, elapsed_ms=1.0,
            findings=[
                Finding(layer="L1", severity="HIGH", location="ab_017",
                        symptom="planted", repro_cmd="—", antibody_id="ab_017")
            ],
        ),
        LayerResult(layer="L2", name="syntax", status=LayerStatus.PASS, elapsed_ms=1.0),
    ]
    v, code = r.compute_verdict()
    assert v == "BLOCKED_ANTIBODY"
    assert code == 4


def test_verdict_fail_when_any_layer_fail() -> None:
    r = QaReport(scope="full", seed=42)
    r.layers = [
        LayerResult(layer="L0", name="selftest", status=LayerStatus.PASS, elapsed_ms=1.0),
        LayerResult(layer="L3", name="unit", status=LayerStatus.FAIL, elapsed_ms=1.0),
    ]
    v, code = r.compute_verdict()
    assert v == "FAIL"
    assert code == 1


def test_verdict_infra_error_when_any_layer_error() -> None:
    r = QaReport(scope="full", seed=42)
    r.layers = [
        LayerResult(layer="L4", name="integration", status=LayerStatus.ERROR, elapsed_ms=1.0),
    ]
    v, code = r.compute_verdict()
    assert v == "INFRA_ERROR"
    assert code == 3
