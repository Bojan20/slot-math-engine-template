"""CI Gate Aggregator — chain repo-wide quality gates.

Each gate is independently runnable and produces a `GateResult` with
status / detail / counters / artifact path. The aggregator never
raises — a tool crash is captured as `GateStatus.ERROR` and surfaced
in the report.

Gate roster (run order):
  1. drift_sentinel  — silent IR math-drift gate (W11)
  2. cert_xml_sanity — every discovered IR emits valid XML (W5.6+)
  3. jurisdiction    — every (IR × profile) lint passes (P1.7)
  4. cert_matrix     — 12×12 topology × feature engine sweep (Mission #3)
                       SKIPPED when engine binary is unavailable

Each gate can be disabled via CiGateConfig flags; SKIPPED gates do
not affect the overall pass verdict.
"""
from __future__ import annotations
import dataclasses
import json
import time
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Iterable

from tools.drift_sentinel import scan_directory
from tools.drift_sentinel.sentinel import DriftClass, DriftSeverity
from tools.jurisdiction.linter import (
    list_profiles as list_jurisdictions,
    load_profile as load_jurisdiction,
    lint_ir,
)
from tools.slot_build.cert_xml import emit_cert_xml, validate_cert_xml


# ─── status sentinel ────────────────────────────────────────────────


class GateStatus(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"
    SKIP = "skip"
    ERROR = "error"


@dataclass
class GateResult:
    name: str
    status: GateStatus
    elapsed_ms: float
    detail: str = ""
    counts: dict[str, int] = field(default_factory=dict)
    findings: list[str] = field(default_factory=list)
    artifact: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status.value,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "detail": self.detail,
            "counts": dict(self.counts),
            "findings": list(self.findings),
            "artifact": self.artifact,
        }


@dataclass
class CiGateConfig:
    """Inputs for the aggregator.

    `games_root`          — directory scanned by drift sentinel and IR
                            discovery (default: `games/`).
    `out_dir`             — where ci-gate.json + ci-gate.md land
                            (default: `<games_root>/.ci-gate/`).
    `jurisdictions`       — profile ids to lint each discovered IR
                            against. Empty list → skip jurisdiction gate.
    `update_baselines`    — propagate to drift sentinel (default False).
    `run_drift`           — toggle drift gate.
    `run_cert_xml`        — toggle cert XML sanity gate.
    `run_jurisdiction`    — toggle jurisdiction gate.
    `run_matrix`          — toggle 12×12 matrix sweep
                            (requires `slot-sim` binary; auto-skip when
                            unavailable).
    `matrix_spins`        — spins/cell for the matrix sweep
                            (default 500 for fast CI runs).
    """

    games_root: Path
    out_dir: Path | None = None
    jurisdictions: list[str] = field(default_factory=list)
    update_baselines: bool = False
    run_drift: bool = True
    run_cert_xml: bool = True
    run_jurisdiction: bool = True
    run_matrix: bool = False
    matrix_spins: int = 500


@dataclass
class CiGateReport:
    config: CiGateConfig
    results: list[GateResult] = field(default_factory=list)
    elapsed_total_ms: float = 0.0

    @property
    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {s.value: 0 for s in GateStatus}
        for r in self.results:
            out[r.status.value] = out.get(r.status.value, 0) + 1
        return out

    @property
    def passed(self) -> bool:
        return all(r.status in (GateStatus.PASS, GateStatus.SKIP)
                   for r in self.results)

    @property
    def has_error(self) -> bool:
        return any(r.status == GateStatus.ERROR for r in self.results)

    def to_dict(self) -> dict[str, Any]:
        cfg = dataclasses.asdict(self.config)
        for k, v in list(cfg.items()):
            if isinstance(v, Path):
                cfg[k] = str(v)
        return {
            "config": cfg,
            "results": [r.to_dict() for r in self.results],
            "counts": self.counts,
            "passed": self.passed,
            "has_error": self.has_error,
            "elapsed_total_ms": round(self.elapsed_total_ms, 2),
        }

    def to_markdown(self) -> str:
        lines: list[str] = []
        verdict = "✅ PASS" if self.passed else (
            "🔴 ERROR" if self.has_error else "🟡 FAIL"
        )
        lines.append(f"# CI Gate Report — {verdict}")
        lines.append("")
        lines.append(f"- games root: `{self.config.games_root}`")
        lines.append(f"- elapsed: {self.elapsed_total_ms:.0f}ms")
        lines.append("")
        lines.append("## Gate summary")
        lines.append("")
        lines.append("| gate | status | elapsed | counts |")
        lines.append("|---|---|---|---|")
        for r in self.results:
            ctx = ", ".join(f"{k}={v}" for k, v in r.counts.items()) or "—"
            lines.append(
                f"| `{r.name}` | {r.status.value.upper()} "
                f"| {r.elapsed_ms:.0f}ms | {ctx} |"
            )
        # Detail blocks
        for r in self.results:
            if r.findings or r.detail:
                lines.append("")
                lines.append(f"### `{r.name}` — {r.status.value}")
                if r.detail:
                    lines.append("")
                    lines.append(r.detail)
                if r.findings:
                    lines.append("")
                    for f in r.findings[:50]:  # cap to keep readable
                        lines.append(f"- {f}")
                    if len(r.findings) > 50:
                        lines.append(
                            f"- … ({len(r.findings) - 50} more)"
                        )
        return "\n".join(lines) + "\n"


# ─── helpers ────────────────────────────────────────────────────────


def _ts_ms() -> float:
    return time.perf_counter() * 1000.0


def _discover_irs(games_root: Path,
                  globs: Iterable[str] = (
                      "**/*.ir.json", "**/ir.json",
                      "**/universal_ir.json",
                  )) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pat in globs:
        for p in sorted(games_root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return out


# ─── individual gates ───────────────────────────────────────────────


def _gate_drift(cfg: CiGateConfig) -> GateResult:
    t = _ts_ms()
    try:
        report = scan_directory(
            cfg.games_root,
            update_baseline=cfg.update_baselines,
        )
    except Exception as e:  # noqa: BLE001
        return GateResult(
            name="drift_sentinel",
            status=GateStatus.ERROR,
            elapsed_ms=_ts_ms() - t,
            detail=str(e),
        )
    counts = dict(report.counts)
    severity = dict(report.severity_counts)
    findings: list[str] = []
    for e in report.entries:
        if e.status == DriftClass.DRIFTED and e.severity == DriftSeverity.RED:
            findings.append(
                f"RED drift: {e.rel_path} Δ={e.delta_abs:.4f}"
            )
        elif e.status == DriftClass.ERROR:
            findings.append(f"parse error: {e.rel_path} ({e.error})")
    if report.has_error:
        status = GateStatus.ERROR
    elif report.has_red:
        status = GateStatus.FAIL
    elif report.has_drift:
        status = GateStatus.WARN
    elif counts.get(DriftClass.NEW.value, 0) > 0 and not cfg.update_baselines:
        # unbaselined-new on an init run is advisory, not failing
        status = GateStatus.WARN
        findings.append(
            f"{counts[DriftClass.NEW.value]} unbaselined NEW IR(s); "
            "re-run with --update-baselines to seed"
        )
    else:
        status = GateStatus.PASS
    merged = {**counts, **{f"sev_{k}": v for k, v in severity.items()}}
    return GateResult(
        name="drift_sentinel",
        status=status,
        elapsed_ms=_ts_ms() - t,
        counts=merged,
        findings=findings,
    )


def _gate_cert_xml(cfg: CiGateConfig) -> GateResult:
    t = _ts_ms()
    ir_paths = _discover_irs(cfg.games_root)
    ok = 0
    failed = 0
    findings: list[str] = []
    out_dir = (cfg.out_dir or (cfg.games_root / ".ci-gate")) / "cert_xml"
    out_dir.mkdir(parents=True, exist_ok=True)
    for p in ir_paths:
        try:
            ir = json.loads(p.read_text())
            xml_path = out_dir / (p.stem + ".cert.xml")
            emit_cert_xml(ir, xml_path)
            check = validate_cert_xml(xml_path)
            if check["passed"]:
                ok += 1
            else:
                failed += 1
                findings.append(
                    f"{p.relative_to(cfg.games_root)}: "
                    f"{', '.join(check.get('issues', []) or ['unknown'])}"
                )
        except Exception as e:  # noqa: BLE001
            failed += 1
            findings.append(f"{p.relative_to(cfg.games_root)}: {e}")
    status = GateStatus.PASS if failed == 0 else GateStatus.FAIL
    if not ir_paths:
        status = GateStatus.SKIP
        detail = "no IRs discovered"
    else:
        detail = f"{ok}/{len(ir_paths)} IRs emit valid XML"
    return GateResult(
        name="cert_xml_sanity",
        status=status,
        elapsed_ms=_ts_ms() - t,
        detail=detail,
        counts={"ok": ok, "failed": failed, "total": len(ir_paths)},
        findings=findings,
        artifact=str(out_dir),
    )


def _gate_jurisdiction(cfg: CiGateConfig) -> GateResult:
    t = _ts_ms()
    if not cfg.jurisdictions:
        return GateResult(
            name="jurisdiction",
            status=GateStatus.SKIP,
            elapsed_ms=_ts_ms() - t,
            detail="no jurisdictions requested",
        )
    ir_paths = _discover_irs(cfg.games_root)
    if not ir_paths:
        return GateResult(
            name="jurisdiction",
            status=GateStatus.SKIP,
            elapsed_ms=_ts_ms() - t,
            detail="no IRs discovered",
        )
    findings: list[str] = []
    profiles = []
    for jid in cfg.jurisdictions:
        try:
            profiles.append((jid, load_jurisdiction(jid)))
        except FileNotFoundError:
            findings.append(f"unknown jurisdiction profile: {jid}")
    total_checks = 0
    errors = 0
    warnings = 0
    for p in ir_paths:
        try:
            ir = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001
            findings.append(f"parse error: {p.relative_to(cfg.games_root)} "
                            f"({e})")
            continue
        for jid, prof in profiles:
            rep = lint_ir(ir, prof)
            total_checks += 1
            if not rep.is_compliant:
                errors += rep.error_count
                findings.append(
                    f"{p.relative_to(cfg.games_root)} × {jid}: "
                    f"{rep.error_count} error(s), "
                    f"{rep.warning_count} warning(s)"
                )
            warnings += rep.warning_count
    if errors > 0:
        status = GateStatus.FAIL
    elif warnings > 0:
        status = GateStatus.WARN
    else:
        status = GateStatus.PASS
    return GateResult(
        name="jurisdiction",
        status=status,
        elapsed_ms=_ts_ms() - t,
        detail=f"{total_checks} (IR × profile) pairs checked",
        counts={
            "ir_count": len(ir_paths),
            "profile_count": len(profiles),
            "errors": errors,
            "warnings": warnings,
            "available_profiles": len(list_jurisdictions()),
        },
        findings=findings,
    )


def _gate_matrix(cfg: CiGateConfig) -> GateResult:
    t = _ts_ms()
    try:
        from tools.cert_lab.matrix_runner import (
            _find_slot_sim_bin,
            run_matrix,
        )
    except Exception as e:  # noqa: BLE001
        return GateResult(
            name="cert_matrix",
            status=GateStatus.ERROR,
            elapsed_ms=_ts_ms() - t,
            detail=f"import failed: {e}",
        )
    if _find_slot_sim_bin() is None:
        return GateResult(
            name="cert_matrix",
            status=GateStatus.SKIP,
            elapsed_ms=_ts_ms() - t,
            detail="slot-sim binary not available",
        )
    try:
        rep = run_matrix(spins_per_cell=cfg.matrix_spins, seed=42)
    except Exception as e:  # noqa: BLE001
        return GateResult(
            name="cert_matrix",
            status=GateStatus.ERROR,
            elapsed_ms=_ts_ms() - t,
            detail=str(e),
        )
    status = GateStatus.PASS if rep.failed == 0 else GateStatus.FAIL
    findings: list[str] = []
    for cell in rep.cells:
        if not cell.passed and not cell.skipped:
            findings.append(
                f"{cell.topology.value} × {cell.feature.value}: {cell.reason}"
            )
    return GateResult(
        name="cert_matrix",
        status=status,
        elapsed_ms=_ts_ms() - t,
        detail=(
            f"{rep.passed}/{rep.total_cells} pass, "
            f"{rep.skipped} skip, {rep.failed} fail"
        ),
        counts={
            "total": rep.total_cells,
            "passed": rep.passed,
            "skipped": rep.skipped,
            "failed": rep.failed,
        },
        findings=findings,
    )


# ─── top-level entry ────────────────────────────────────────────────


def run_ci_gate(cfg: CiGateConfig) -> CiGateReport:
    """Run every enabled gate and return a consolidated report.
    Never raises. Writes ci-gate.json + ci-gate.md into cfg.out_dir."""
    cfg.games_root = Path(cfg.games_root)
    out_dir = Path(cfg.out_dir) if cfg.out_dir else (cfg.games_root / ".ci-gate")
    cfg.out_dir = out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    report = CiGateReport(config=cfg)
    t0 = _ts_ms()

    if cfg.run_drift:
        report.results.append(_gate_drift(cfg))
    else:
        report.results.append(GateResult(
            name="drift_sentinel", status=GateStatus.SKIP,
            elapsed_ms=0.0, detail="disabled via config",
        ))

    if cfg.run_cert_xml:
        report.results.append(_gate_cert_xml(cfg))
    else:
        report.results.append(GateResult(
            name="cert_xml_sanity", status=GateStatus.SKIP,
            elapsed_ms=0.0, detail="disabled via config",
        ))

    if cfg.run_jurisdiction:
        report.results.append(_gate_jurisdiction(cfg))
    else:
        report.results.append(GateResult(
            name="jurisdiction", status=GateStatus.SKIP,
            elapsed_ms=0.0, detail="disabled via config",
        ))

    if cfg.run_matrix:
        report.results.append(_gate_matrix(cfg))
    else:
        report.results.append(GateResult(
            name="cert_matrix", status=GateStatus.SKIP,
            elapsed_ms=0.0, detail="disabled via config",
        ))

    report.elapsed_total_ms = _ts_ms() - t0

    (out_dir / "ci-gate.json").write_text(
        json.dumps(report.to_dict(), indent=2, sort_keys=True)
    )
    (out_dir / "ci-gate.md").write_text(report.to_markdown())
    return report
