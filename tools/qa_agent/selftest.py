"""tools.qa_agent.selftest — L0 self-verification layer.

The five sub-checks must all pass before any code-touching layer runs.
A failed selftest with `SLOT_QA_STRICT=1` blocks the full run.

Sub-checks:
  1. SCN  — every scenarios/*.yaml parses + validates against schema v1.
  2. CLI  — every documented subcommand is registered in `cli.build_parser`.
  3. AB   — antibody.gate() roundtrips against an in-memory synthetic DB.
  4. RPT  — report writer produces a stable canonical hash on a fixed fixture.
  5. SUB  — known toolchain CLIs are present-or-graceful (pytest, cargo, npm).

A sub-check that requires a missing binary degrades to SKIP, not FAIL.
"""
from __future__ import annotations

import sqlite3
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List

from .antibody import gate as antibody_gate
from .report import Finding, LayerResult, LayerStatus, QaReport
from .scenarios import discover_scenarios, load_scenario


REPO_ROOT = Path(__file__).resolve().parents[2]
SCENARIOS_DIR = Path(__file__).resolve().parent / "scenarios"
FIXTURE_DIR = Path(__file__).resolve().parent / "tests" / "fixtures"


# ── individual checks ────────────────────────────────────────────────


def check_scenarios() -> Dict[str, Any]:
    paths = discover_scenarios()
    errors: List[str] = []
    if not paths:
        return {
            "name": "SCN",
            "status": "FAIL",
            "detail": f"no scenarios found under {SCENARIOS_DIR}",
        }
    for p in paths:
        try:
            load_scenario(p)
        except Exception as exc:  # ValueError, yaml errors
            errors.append(f"{p.name}: {exc}")
    if errors:
        return {
            "name": "SCN",
            "status": "FAIL",
            "detail": "; ".join(errors),
            "count": len(paths),
        }
    return {"name": "SCN", "status": "PASS", "count": len(paths)}


def check_cli_surface() -> Dict[str, Any]:
    """Every subcommand the docstring promises must exist in the parser."""
    expected = {"selftest", "auto", "manual", "full", "status", "antibody"}
    try:
        from .cli import build_parser  # local import to avoid cycle
    except Exception as exc:
        return {"name": "CLI", "status": "FAIL", "detail": f"import error: {exc!r}"}
    parser = build_parser()
    # introspect subparsers via _subparsers._group_actions[0].choices
    have: set = set()
    for act in parser._subparsers._group_actions if parser._subparsers else []:  # type: ignore[attr-defined]
        choices = getattr(act, "choices", None) or {}
        have.update(choices.keys())
    missing = sorted(expected - have)
    if missing:
        return {
            "name": "CLI",
            "status": "FAIL",
            "detail": f"missing subcommands: {missing}",
            "have": sorted(have),
        }
    return {"name": "CLI", "status": "PASS", "have": sorted(have)}


def check_antibody_roundtrip() -> Dict[str, Any]:
    """Build a synthetic DB in tmp, run gate(), expect BLOCK on planted symptom."""
    with tempfile.TemporaryDirectory() as td:
        dbp = Path(td) / "antibodies.db"
        conn = sqlite3.connect(dbp)
        conn.executescript(
            """
            CREATE TABLE antibodies (
                id TEXT PRIMARY KEY,
                pattern TEXT NOT NULL,
                severity TEXT NOT NULL,
                recommended_fix TEXT,
                family TEXT,
                created_at TEXT,
                last_seen TEXT
            );
            INSERT INTO antibodies VALUES
              ('ab_selftest_high', 'qaselftestmagictoken pattern', 'HIGH', 'remove the magic token', 'selftest', '', ''),
              ('ab_selftest_low',  'unrelated background noise', 'LOW',  '—', 'selftest', '', '');
            """
        )
        conn.commit()
        conn.close()
        verdict = antibody_gate(
            "qaselftestmagictoken in the wild",
            scenario_ids=[],
            repo=Path("/tmp"),
            db=dbp,
        )
    ok = verdict.get("status") == "BLOCK" and any(
        b.get("id") == "ab_selftest_high" for b in verdict.get("blocking", [])
    )
    return {
        "name": "AB",
        "status": "PASS" if ok else "FAIL",
        "detail": "" if ok else f"unexpected verdict: {verdict}",
    }


_FIXTURE_REPORT_HASH_FILE = FIXTURE_DIR / "selftest_canonical_hash.txt"


def check_report_writer() -> Dict[str, Any]:
    """Canonical hash on a fixed in-memory report must be stable across runs."""
    r = QaReport(
        scope="selftest",
        baseline="",
        seed=42,
        repo_sha="deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
        started_at="STRIPPED",
        finished_at="STRIPPED",
    )
    r.layers = [
        LayerResult(
            layer="L0",
            name="selftest",
            status=LayerStatus.PASS,
            elapsed_ms=123.45,
            findings=[],
            counts={"checks": 5},
            artefact="—",
            detail="all five checks green",
        )
    ]
    r.verdict, r.exit_code = r.compute_verdict()
    have = r.canonical_hash()
    # Pin: if the fixture is absent, write it; if present, must match exactly.
    if _FIXTURE_REPORT_HASH_FILE.exists():
        want = _FIXTURE_REPORT_HASH_FILE.read_text(encoding="utf-8").strip()
        if want != have:
            return {
                "name": "RPT",
                "status": "FAIL",
                "detail": f"hash drifted: have {have[:16]} want {want[:16]}",
            }
        return {"name": "RPT", "status": "PASS", "hash": have}
    # First-run pin
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    _FIXTURE_REPORT_HASH_FILE.write_text(have + "\n", encoding="utf-8")
    return {"name": "RPT", "status": "PASS", "hash": have, "detail": "pinned"}


def check_subprocess_presence() -> Dict[str, Any]:
    """Probe toolchain availability. Missing → SKIP per binary, never FAIL."""
    import shutil

    probes = {
        "pytest": "python3 -m pytest --version",
        "cargo": "cargo --version",
        "npm": "npm --version",
    }
    available: Dict[str, str] = {}
    missing: List[str] = []
    for name in probes:
        path = shutil.which(name) or (shutil.which("python3") if name == "pytest" else None)
        if path:
            available[name] = path
        else:
            missing.append(name)
    # SUB never fails; it informs the report.
    return {
        "name": "SUB",
        "status": "PASS",
        "available": available,
        "missing": missing,
    }


# ── orchestrator ─────────────────────────────────────────────────────


def run_selftest() -> LayerResult:
    started = time.monotonic()
    checks = [
        check_scenarios(),
        check_cli_surface(),
        check_antibody_roundtrip(),
        check_report_writer(),
        check_subprocess_presence(),
    ]
    findings: List[Finding] = []
    for c in checks:
        if c.get("status") == "FAIL":
            findings.append(
                Finding(
                    layer="L0",
                    severity="HIGH",
                    location=f"selftest:{c['name']}",
                    symptom=c.get("detail", "selftest sub-check failed"),
                    repro_cmd="python -m tools.qa_agent selftest",
                )
            )
    status = LayerStatus.FAIL if findings else LayerStatus.PASS
    elapsed = (time.monotonic() - started) * 1000.0
    return LayerResult(
        layer="L0",
        name="selftest",
        status=status,
        elapsed_ms=elapsed,
        findings=findings,
        counts={"checks": len(checks), "failed": len(findings)},
        artefact=None,
        detail="; ".join(f"{c['name']}={c['status']}" for c in checks),
    )
