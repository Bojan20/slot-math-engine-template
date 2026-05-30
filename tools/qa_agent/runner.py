"""tools.qa_agent.runner — top-level orchestrator across L0..L9.

The runner is the only piece that knows the full layer roster + scope
matrix. Every layer is invoked through a uniform `(ctx) -> LayerResult`
boundary so adding L10+ later is a single-line change.

Scope matrix (which layers run):

  selftest   → L0
  quick      → L0, L1, L2, L3, L9
  auto       → L0, L1, L2, L3, L4, L5, L8
  manual     → L0, L9
  full       → L0..L9 (every layer, mutation SKIP if absent)
  status     → no run; read last report.json from reports/qa_agent/

Antibody gate short-circuits: if L1 returns BLOCK, all layers after L1
are auto-SKIP with `blocked by L1` detail.

Determinism:
  • Seed pinned via SLOT_QA_SEED env, default 42.
  • Optional --verify-determinism re-runs the layered roster and
    asserts canonical_hash() matches.
"""
from __future__ import annotations

import dataclasses
import json
import os
import subprocess  # noqa: S404 — `git rev-parse HEAD` only
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from . import antibody as antibody_layer
from .auto import (
    LayerContext,
    run_l2_syntax,
    run_l3_unit,
    run_l4_integration,
    run_l5_property,
    run_l6_mutation,
    run_l8_coverage,
)
from .manual import run_l9_manual
from .regress import run_l7_regression
from .report import (
    Finding,
    LayerResult,
    LayerStatus,
    QaReport,
    now_iso_utc,
    report_dir,
)
from .selftest import run_selftest


class QaScope(str, Enum):
    SELFTEST = "selftest"
    QUICK = "quick"
    AUTO = "auto"
    MANUAL = "manual"
    FULL = "full"
    STATUS = "status"

    @classmethod
    def parse(cls, raw: str) -> "QaScope":
        try:
            return cls(raw)
        except ValueError as exc:
            allowed = [v.value for v in cls]
            raise ValueError(f"unknown scope {raw!r}; allowed: {allowed}") from exc


# Layer roster per scope.
_SCOPE_LAYERS: Dict[QaScope, Tuple[str, ...]] = {
    QaScope.SELFTEST: ("L0",),
    QaScope.QUICK: ("L0", "L1", "L2", "L3", "L9"),
    QaScope.AUTO: ("L0", "L1", "L2", "L3", "L4", "L5", "L8"),
    QaScope.MANUAL: ("L0", "L9"),
    QaScope.FULL: ("L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8", "L9"),
    QaScope.STATUS: (),
}


@dataclass
class QaConfig:
    scope: QaScope = QaScope.AUTO
    baseline: str = ""
    seed: int = 42
    only_scenario: Optional[str] = None
    extra_scenarios_dir: Optional[Path] = None
    skip: set = field(default_factory=set)
    allow_dirty: bool = False
    out_root: Optional[Path] = None
    repo: Path = field(default_factory=lambda: Path.cwd())
    verify_determinism: bool = False
    strict_selftest: bool = field(
        default_factory=lambda: os.environ.get("SLOT_QA_STRICT", "") == "1"
    )


# ── helpers ──────────────────────────────────────────────────────────


def _git_head_sha(repo: Path) -> str:
    try:
        out = subprocess.run(  # noqa: S603
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo),
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return ""
    return out.stdout.strip() if out.returncode == 0 else ""


def _git_dirty(repo: Path) -> List[str]:
    try:
        out = subprocess.run(  # noqa: S603
            ["git", "status", "--porcelain"],
            cwd=str(repo),
            capture_output=True,
            text=True,
            timeout=5,
        )
    except Exception:
        return []
    if out.returncode != 0:
        return []
    return [ln for ln in out.stdout.splitlines() if ln.strip()]


def _antibody_layer_result(verdict: Dict[str, Any]) -> LayerResult:
    if verdict.get("status") == "SKIP":
        return LayerResult(
            layer="L1",
            name="antibody",
            status=LayerStatus.SKIP,
            elapsed_ms=0.0,
            artefact=None,
            detail=verdict.get("reason", "skipped"),
        )
    findings: List[Finding] = []
    for hit in verdict.get("blocking", []):
        findings.append(
            Finding(
                layer="L1",
                severity=hit.get("severity", "HIGH"),
                location=f"antibody:{hit.get('id','?')}",
                symptom=hit.get("pattern", ""),
                repro_cmd=hit.get("recommended_fix", ""),
                antibody_id=hit.get("id"),
            )
        )
    status = LayerStatus.FAIL if findings else LayerStatus.PASS
    return LayerResult(
        layer="L1",
        name="antibody",
        status=status,
        elapsed_ms=0.0,
        findings=findings,
        counts={
            "blocking": len(verdict.get("blocking", [])),
            "warnings": len(verdict.get("warnings", [])),
        },
        artefact=None,
        detail=f"db={verdict.get('db','—')} tokens={len(verdict.get('tokens', []))}",
    )


def _layer_runner(layer: str, cfg: QaConfig, ctx: LayerContext, out_dir: Path) -> LayerResult:
    if layer == "L0":
        return run_selftest()
    if layer == "L1":
        v = antibody_layer.gate(
            symptom=f"qa scope {cfg.scope.value} seed {cfg.seed}",
            scenario_ids=[cfg.only_scenario] if cfg.only_scenario else [],
            repo=cfg.repo,
        )
        return _antibody_layer_result(v)
    if layer == "L2":
        return run_l2_syntax(ctx)
    if layer == "L3":
        return run_l3_unit(ctx)
    if layer == "L4":
        return run_l4_integration(ctx)
    if layer == "L5":
        return run_l5_property(ctx)
    if layer == "L6":
        return run_l6_mutation(ctx)
    if layer == "L7":
        return run_l7_regression(
            cfg.repo,
            out_dir,
            baseline_ref=cfg.baseline or "origin/main",
            skip="L7" in cfg.skip,
        )
    if layer == "L8":
        return run_l8_coverage(ctx)
    if layer == "L9":
        return run_l9_manual(
            cfg.repo,
            out_dir,
            only=cfg.only_scenario,
            extra_dir=cfg.extra_scenarios_dir,
            skip="L9" in cfg.skip,
        )
    raise ValueError(f"unknown layer {layer!r}")


def _empty_layer(layer: str, reason: str) -> LayerResult:
    NAMES = {
        "L0": "selftest", "L1": "antibody", "L2": "syntax", "L3": "unit",
        "L4": "integration", "L5": "property", "L6": "mutation",
        "L7": "regression", "L8": "coverage", "L9": "manual",
    }
    return LayerResult(
        layer=layer,
        name=NAMES.get(layer, "?"),
        status=LayerStatus.SKIP,
        elapsed_ms=0.0,
        artefact=None,
        detail=reason,
    )


# ── primary entry point ──────────────────────────────────────────────


def run_qa(cfg: QaConfig) -> Tuple[QaReport, Path]:
    """Run the configured scope. Returns (report, run_dir)."""
    cfg.repo = cfg.repo.resolve()
    out_root = cfg.out_root or (cfg.repo / "reports" / "qa_agent")
    run_dir = report_dir(out_root)

    # Dirty repo guard (except status / selftest which are read-only).
    if cfg.scope not in (QaScope.STATUS, QaScope.SELFTEST) and not cfg.allow_dirty:
        dirty = _git_dirty(cfg.repo)
        if dirty:
            r = QaReport(
                scope=cfg.scope.value,
                baseline=cfg.baseline,
                seed=cfg.seed,
                repo_sha=_git_head_sha(cfg.repo),
                started_at=now_iso_utc(),
                finished_at=now_iso_utc(),
            )
            r.verdict, r.exit_code = "BAD_INPUT", 2
            r.layers = [
                LayerResult(
                    layer="L-input",
                    name="repo",
                    status=LayerStatus.FAIL,
                    elapsed_ms=0.0,
                    findings=[
                        Finding(
                            layer="L-input",
                            severity="HIGH",
                            location="repo",
                            symptom=f"repo dirty ({len(dirty)} entries); pass --allow-dirty to override",
                            repro_cmd="git status --porcelain",
                        )
                    ],
                    artefact=None,
                    detail=" / ".join(dirty[:5]),
                )
            ]
            r.write_json(run_dir / "report.json")
            r.write_markdown(run_dir / "report.md")
            return r, run_dir

    if cfg.scope == QaScope.STATUS:
        return _read_last_status(cfg, out_root)

    # Export seed to the parent env so env-check scenarios + child subprocesses
    # both observe the same value. This must happen BEFORE layers run.
    os.environ["SLOT_QA_SEED"] = str(cfg.seed)
    os.environ.setdefault("PYTHONHASHSEED", str(cfg.seed))

    layers_to_run = _SCOPE_LAYERS[cfg.scope]
    report = QaReport(
        scope=cfg.scope.value,
        baseline=cfg.baseline,
        seed=cfg.seed,
        repo_sha=_git_head_sha(cfg.repo),
        started_at=now_iso_utc(),
    )
    # W244 wave 7 — `SLOT_QA_QUICK=1` signal for L3 pytest to apply
    # `-m "not slow"` filter. Quick/AUTO scope hides Z3 multi-objective,
    # stress synth, LLM-ingest E2E, benchmark; FULL scope runs everything.
    ctx_env = {"SLOT_QA_SEED": str(cfg.seed)}
    if cfg.scope in (QaScope.QUICK, QaScope.AUTO):
        ctx_env["SLOT_QA_QUICK"] = "1"

    ctx = LayerContext(
        repo=cfg.repo,
        out_dir=run_dir,
        seed=cfg.seed,
        skip=cfg.skip,
        env=ctx_env,
    )

    block_after = None  # layer id past which we cascade-SKIP
    for layer in layers_to_run:
        if block_after:
            report.layers.append(
                _empty_layer(layer, f"blocked by {block_after}")
            )
            continue
        try:
            res = _layer_runner(layer, cfg, ctx, run_dir)
        except Exception as exc:
            res = LayerResult(
                layer=layer,
                name="error",
                status=LayerStatus.ERROR,
                elapsed_ms=0.0,
                findings=[
                    Finding(
                        layer=layer,
                        severity="CRITICAL",
                        location=__file__,
                        symptom=f"runner raised: {exc!r}",
                        repro_cmd=f"python -m tools.qa_agent {cfg.scope.value}",
                    )
                ],
                detail=repr(exc),
            )
        report.layers.append(res)
        # Cascade-skip after antibody block.
        if layer == "L1" and res.status == LayerStatus.FAIL:
            block_after = "L1"
        # Cascade-skip after a hard L0 failure when strict.
        if layer == "L0" and res.status == LayerStatus.FAIL and cfg.strict_selftest:
            block_after = "L0"
            # Promote to verdict-relevant input failure.
            report.verdict = "BAD_INPUT"

    report.finished_at = now_iso_utc()
    if not report.antibody_matches:
        ab = next((l for l in report.layers if l.layer == "L1"), None)
        if ab and ab.findings:
            report.antibody_matches = [
                {"id": f.antibody_id, "severity": f.severity,
                 "recommended_fix": f.repro_cmd}
                for f in ab.findings
            ]
    if report.verdict != "BAD_INPUT":
        report.verdict, report.exit_code = report.compute_verdict()
    else:
        report.exit_code = 2

    # Determinism check (optional, only on FULL).
    if cfg.verify_determinism and report.exit_code in (0, 1):
        canon_a = report.canonical_hash()
        # Re-run a small fast subset to confirm determinism (selftest + manual).
        cfg2 = dataclasses.replace(cfg, verify_determinism=False)
        cfg2.scope = QaScope.MANUAL
        r2, _ = run_qa(cfg2)
        canon_b = r2.canonical_hash()
        report.determinism = {
            "byte_identical": canon_a == canon_b,
            "canonical_hash": canon_a,
            "rerun_canonical_hash": canon_b,
        }
        if canon_a != canon_b:
            report.layers.append(
                LayerResult(
                    layer="L-det",
                    name="determinism",
                    status=LayerStatus.FAIL,
                    elapsed_ms=0.0,
                    findings=[
                        Finding(
                            layer="L-det",
                            severity="CRITICAL",
                            location="canonical_hash",
                            symptom=f"hash drifted: {canon_a[:16]} vs {canon_b[:16]}",
                            repro_cmd="python -m tools.qa_agent full --verify-determinism",
                        )
                    ],
                )
            )
            report.verdict, report.exit_code = "FAIL", 1

    report.write_json(run_dir / "report.json")
    report.write_markdown(run_dir / "report.md")
    # Symlink `latest` for convenience (best-effort).
    latest = out_root / "latest"
    try:
        if latest.exists() or latest.is_symlink():
            latest.unlink()
        latest.symlink_to(run_dir.name)
    except OSError:
        pass
    return report, run_dir


def _read_last_status(cfg: QaConfig, out_root: Path) -> Tuple[QaReport, Path]:
    """Return the last persisted report (or a synthetic empty one)."""
    if not out_root.exists():
        r = QaReport(scope=cfg.scope.value, started_at=now_iso_utc(), finished_at=now_iso_utc())
        r.verdict, r.exit_code = "ALL_PASS", 0
        r.layers = [_empty_layer("L-status", "no prior runs")]
        return r, out_root
    candidates = sorted(
        [p for p in out_root.glob("*/report.json")],
        key=lambda p: p.parent.name,
    )
    if not candidates:
        r = QaReport(scope=cfg.scope.value, started_at=now_iso_utc(), finished_at=now_iso_utc())
        r.verdict, r.exit_code = "ALL_PASS", 0
        r.layers = [_empty_layer("L-status", "no prior runs")]
        return r, out_root
    last = candidates[-1]
    try:
        data = json.loads(last.read_text(encoding="utf-8"))
    except Exception as exc:
        r = QaReport(scope=cfg.scope.value, started_at=now_iso_utc(), finished_at=now_iso_utc())
        r.verdict, r.exit_code = "INFRA_ERROR", 3
        r.layers = [
            LayerResult(
                layer="L-status",
                name="status",
                status=LayerStatus.ERROR,
                elapsed_ms=0.0,
                detail=f"could not read {last}: {exc!r}",
            )
        ]
        return r, last.parent
    r = QaReport(
        schema=data.get("schema", "urn:slotmath:qa-agent:report:v1"),
        scope=data.get("scope", ""),
        baseline=data.get("baseline", ""),
        seed=int(data.get("seed", 42)),
        repo_sha=data.get("repo_sha", ""),
        started_at=data.get("started_at", ""),
        finished_at=data.get("finished_at", ""),
        verdict=data.get("verdict", ""),
        exit_code=int(data.get("exit_code", 0)),
        antibody_matches=list(data.get("antibody_matches", [])),
        determinism=dict(data.get("determinism", {})),
    )
    for ld in data.get("layers", []):
        r.layers.append(
            LayerResult(
                layer=ld.get("layer", "?"),
                name=ld.get("name", "?"),
                status=LayerStatus(ld.get("status", "SKIP")),
                elapsed_ms=float(ld.get("elapsed_ms", 0.0)),
                counts=dict(ld.get("counts", {})),
                artefact=ld.get("artefact"),
                detail=ld.get("detail", ""),
            )
        )
    return r, last.parent
