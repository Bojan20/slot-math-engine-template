"""Operator Pilot orchestrator.

Glue layer that chains every regulator-grade artifact emitter into
a single pipeline:

  IR in → (lint × N jurisdictions) → (cert XML) → (cert ZIP, signed)
        → (operator-pilot.json) → (operator-package.<game>.<swid>.zip)

Each step is recorded in `PilotReport.steps` with status, elapsed
time, output path, and any error message. The orchestrator never
raises — even a failing step produces a recorded failure that the
caller can introspect or surface as exit code.
"""
from __future__ import annotations
import dataclasses
import json
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from tools.jurisdiction.linter import (
    JurisdictionProfile,
    lint_ir,
    load_profile as load_jurisdiction,
)
from tools.slot_build.cert_xml import emit_cert_xml, validate_cert_xml

try:
    from tools.slot_build.cert_package import build_cert_package
    _HAS_CERT_PKG = True
except Exception:  # pragma: no cover — cryptography optional
    _HAS_CERT_PKG = False


# ─── status sentinel ────────────────────────────────────────────────

PASSED = "passed"
SKIPPED = "skipped"
FAILED = "failed"


# ─── data shapes ────────────────────────────────────────────────────


@dataclass
class PilotStep:
    name: str
    status: str
    elapsed_ms: float
    output: str | None = None
    detail: str | None = None
    issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "status": self.status,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "output": self.output,
            "detail": self.detail,
            "issues": list(self.issues),
        }


@dataclass
class PilotConfig:
    """Inputs for one operator-pilot run.

    `ir_path`            — universal IR JSON.
    `out_dir`            — directory to populate with artifacts.
    `jurisdictions`      — list of profile ids ("ukgc", "mga", "gli16", ...).
                           Empty → skip lint step.
    `emit_xml`           — emit regulator XML cert?
    `emit_zip`           — emit signed cert ZIP?
    `bundle_zip`         — pack the entire out_dir into one operator
                           package ZIP at out_dir/operator-package.zip.
    `game_id`            — used for cert ZIP file name. Auto-derived
                           from IR meta if None.
    `swid`               — used for cert ZIP file name. Auto-derived.
    `vendor`             — used for cert ZIP file name. Auto-derived.
    `raw_dir`            — original PAR raw directory (for PAR commit
                           hashes inside cert ZIP). Optional.
    `mc_report_path`     — optional pre-existing MC report JSON to
                           include in cert XML + ZIP.
    """

    ir_path: Path
    out_dir: Path
    jurisdictions: list[str] = field(default_factory=list)
    emit_xml: bool = True
    emit_zip: bool = True
    bundle_zip: bool = True
    game_id: str | None = None
    swid: str | None = None
    vendor: str | None = None
    raw_dir: Path | None = None
    mc_report_path: Path | None = None


@dataclass
class PilotReport:
    config: PilotConfig
    steps: list[PilotStep] = field(default_factory=list)
    artifacts: dict[str, str] = field(default_factory=dict)
    bundle_path: str | None = None
    elapsed_total_ms: float = 0.0

    @property
    def passed(self) -> bool:
        return all(s.status != FAILED for s in self.steps)

    @property
    def step_counts(self) -> dict[str, int]:
        out = {PASSED: 0, SKIPPED: 0, FAILED: 0}
        for s in self.steps:
            out[s.status] = out.get(s.status, 0) + 1
        return out

    def to_dict(self) -> dict[str, Any]:
        cfg = dataclasses.asdict(self.config)
        # pathlib.Path → str for JSON safety
        for k, v in list(cfg.items()):
            if isinstance(v, Path):
                cfg[k] = str(v)
        return {
            "config": cfg,
            "steps": [s.to_dict() for s in self.steps],
            "artifacts": dict(self.artifacts),
            "bundle_path": self.bundle_path,
            "elapsed_total_ms": round(self.elapsed_total_ms, 2),
            "step_counts": self.step_counts,
            "passed": self.passed,
        }


# ─── small helpers ──────────────────────────────────────────────────


def _ts_ms() -> float:
    return time.perf_counter() * 1000.0


def _step(report: PilotReport, name: str, status: str, start_ms: float,
          *, output: str | None = None, detail: str | None = None,
          issues: Iterable[str] | None = None) -> PilotStep:
    s = PilotStep(
        name=name,
        status=status,
        elapsed_ms=_ts_ms() - start_ms,
        output=output,
        detail=detail,
        issues=list(issues or []),
    )
    report.steps.append(s)
    return s


def _derive_id(ir: dict[str, Any], cfg: PilotConfig) -> tuple[str, str, str]:
    """Pull (game_id, swid, vendor) from cfg, falling back to IR meta."""
    meta = ir.get("meta") or {}
    game_id = (cfg.game_id or meta.get("game_id") or meta.get("id")
               or meta.get("name") or "game")
    swid = cfg.swid or meta.get("swid") or "swid-0001"
    vendor = cfg.vendor or meta.get("vendor") or "unknown"
    # normalize for file names: ASCII-safe slug
    def _safe(s: Any) -> str:
        out = "".join(
            c if c.isalnum() or c in "-_." else "_" for c in str(s)
        ).strip("_")
        return out or "x"

    return _safe(game_id), _safe(swid), _safe(vendor)


# ─── individual steps ───────────────────────────────────────────────


def _step_load_ir(report: PilotReport, cfg: PilotConfig) -> dict[str, Any] | None:
    t = _ts_ms()
    try:
        ir = json.loads(cfg.ir_path.read_text())
    except Exception as e:
        _step(report, "load_ir", FAILED, t, detail=str(e))
        return None
    _step(report, "load_ir", PASSED, t, output=str(cfg.ir_path),
          detail=f"keys={sorted(ir)[:6]}…")
    return ir


def _step_jurisdiction_lint(report: PilotReport, cfg: PilotConfig,
                             ir: dict[str, Any]) -> list[dict[str, Any]]:
    """Run lint against every requested jurisdiction. Returns serialized
    reports (used downstream by cert XML)."""
    if not cfg.jurisdictions:
        _step(report, "jurisdiction_lint", SKIPPED, _ts_ms(),
              detail="no jurisdictions requested")
        return []
    serialized: list[dict[str, Any]] = []
    for jid in cfg.jurisdictions:
        t = _ts_ms()
        try:
            profile: JurisdictionProfile = load_jurisdiction(jid)
        except FileNotFoundError as e:
            _step(report, f"jurisdiction_lint:{jid}", FAILED, t,
                  detail=str(e))
            continue
        rep = lint_ir(ir, profile)
        compliant = rep.is_compliant
        status = PASSED if compliant else FAILED
        issues = [v.message for v in rep.violations
                  if v.severity.value == "error"]
        _step(report, f"jurisdiction_lint:{jid}", status, t,
              detail=(f"violations: err={rep.error_count} "
                      f"warn={rep.warning_count} info={rep.info_count}"),
              issues=issues)
        serialized.append({
            "jurisdiction": jid,
            "compliant": compliant,
            "error_count": rep.error_count,
            "warning_count": rep.warning_count,
            "info_count": rep.info_count,
            "violations": [
                {
                    "severity": v.severity.value,
                    "rule": v.rule_id,
                    "message": v.message,
                    "field": v.field,
                    "can_auto_fix": v.can_auto_fix,
                }
                for v in rep.violations
            ],
        })
    return serialized


def _step_cert_xml(report: PilotReport, cfg: PilotConfig,
                    ir: dict[str, Any],
                    juris_reports: list[dict[str, Any]]) -> Path | None:
    if not cfg.emit_xml:
        _step(report, "cert_xml", SKIPPED, _ts_ms(),
              detail="emit_xml=False")
        return None
    t = _ts_ms()
    game_id, swid, _ = _derive_id(ir, cfg)
    out_path = cfg.out_dir / f"{game_id}.{swid}.cert.xml"
    mc_report = None
    if cfg.mc_report_path and cfg.mc_report_path.exists():
        try:
            mc_report = json.loads(cfg.mc_report_path.read_text())
        except Exception:
            mc_report = None
    try:
        emit_cert_xml(
            ir,
            out_path,
            mc_report=mc_report,
            jurisdiction_reports=juris_reports,
        )
        check = validate_cert_xml(out_path)
    except Exception as e:
        _step(report, "cert_xml", FAILED, t, detail=str(e))
        return None
    if not check["passed"]:
        _step(report, "cert_xml", FAILED, t, output=str(out_path),
              detail="validator rejected",
              issues=check.get("issues") or [])
        return None
    _step(report, "cert_xml", PASSED, t, output=str(out_path),
          detail=f"sections={len(check['sections_found'])}")
    report.artifacts["cert_xml"] = str(out_path)
    return out_path


def _step_cert_zip(report: PilotReport, cfg: PilotConfig,
                    ir: dict[str, Any]) -> Path | None:
    if not cfg.emit_zip:
        _step(report, "cert_zip", SKIPPED, _ts_ms(),
              detail="emit_zip=False")
        return None
    if not _HAS_CERT_PKG:
        _step(report, "cert_zip", SKIPPED, _ts_ms(),
              detail="cryptography library not available")
        return None
    t = _ts_ms()
    game_id, swid, vendor = _derive_id(ir, cfg)
    try:
        zip_path = build_cert_package(
            out_dir=cfg.out_dir,
            game_id=game_id,
            swid=swid,
            vendor=vendor,
            universal_ir_path=cfg.ir_path,
            raw_dir=cfg.raw_dir,
            mc_report_path=cfg.mc_report_path,
        )
    except Exception as e:
        _step(report, "cert_zip", FAILED, t, detail=str(e))
        return None
    _step(report, "cert_zip", PASSED, t, output=str(zip_path),
          detail=f"size={zip_path.stat().st_size}B")
    report.artifacts["cert_zip"] = str(zip_path)
    return zip_path


def _step_manifest(report: PilotReport, cfg: PilotConfig) -> Path:
    t = _ts_ms()
    out = cfg.out_dir / "operator-pilot.json"
    out.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    _step(report, "manifest", PASSED, t, output=str(out))
    report.artifacts["manifest"] = str(out)
    return out


def _step_bundle(report: PilotReport, cfg: PilotConfig) -> Path | None:
    if not cfg.bundle_zip:
        _step(report, "bundle_zip", SKIPPED, _ts_ms(),
              detail="bundle_zip=False")
        return None
    t = _ts_ms()
    bundle = cfg.out_dir / "operator-package.zip"
    # Build atomically — exclude any prior operator-package.zip
    tmp = bundle.with_suffix(".zip.tmp")
    with zipfile.ZipFile(tmp, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(cfg.out_dir.rglob("*")):
            if p.is_dir():
                continue
            if p.name in ("operator-package.zip", "operator-package.zip.tmp"):
                continue
            zf.write(p, p.relative_to(cfg.out_dir))
    tmp.replace(bundle)
    _step(report, "bundle_zip", PASSED, t, output=str(bundle),
          detail=f"size={bundle.stat().st_size}B")
    report.bundle_path = str(bundle)
    return bundle


# ─── top-level entry point ──────────────────────────────────────────


def run_pilot(cfg: PilotConfig) -> PilotReport:
    """Execute the full operator-pilot chain and return a PilotReport.

    Never raises — failures are recorded as FAILED steps.
    """
    cfg.out_dir = Path(cfg.out_dir)
    cfg.ir_path = Path(cfg.ir_path)
    cfg.out_dir.mkdir(parents=True, exist_ok=True)

    report = PilotReport(config=cfg)
    t0 = _ts_ms()

    ir = _step_load_ir(report, cfg)
    if ir is None:
        report.elapsed_total_ms = _ts_ms() - t0
        # write a partial manifest so the failure is inspectable
        _step_manifest(report, cfg)
        return report

    juris_reports = _step_jurisdiction_lint(report, cfg, ir)
    _step_cert_xml(report, cfg, ir, juris_reports)
    _step_cert_zip(report, cfg, ir)
    _step_manifest(report, cfg)
    _step_bundle(report, cfg)

    report.elapsed_total_ms = _ts_ms() - t0
    # Re-emit manifest after bundle step so it reflects final state
    (cfg.out_dir / "operator-pilot.json").write_text(
        json.dumps(report.to_dict(), indent=2, sort_keys=True)
    )
    return report
