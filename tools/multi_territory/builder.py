"""Multi-territory release builder — chains W51 + W52 + jurisdiction linter."""
from __future__ import annotations
import hashlib
import json
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.jurisdiction.linter import (
    ComplianceReport,
    ViolationSeverity,
    lint_ir,
    load_profile,
)
from tools.slot_build.cert_xml_v2 import (
    JurisdictionEntry,
    emit_cert_xml_v2,
    ir_digest,
)
from tools.plugin_marketplace.registry import FilesystemMarketplace
from tools.plugin_marketplace.verifier import MarketplaceVerifier


@dataclass
class PerJurisdictionResult:
    profile_id: str
    compliance_path: str
    passed: bool
    n_errors: int
    n_warnings: int
    digest_for_cert: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "compliance_path": self.compliance_path,
            "passed": self.passed,
            "n_errors": self.n_errors,
            "n_warnings": self.n_warnings,
            "digest_for_cert": self.digest_for_cert,
        }


@dataclass
class MultiTerritoryReport:
    game_id: str
    out_zip: str
    n_profiles: int
    per_jurisdiction: list[PerJurisdictionResult] = field(default_factory=list)
    cert_xml_passed: bool = False
    marketplace_round_trip_passed: bool = False
    manifest_sha256: str = ""

    @property
    def passed(self) -> bool:
        return (
            self.cert_xml_passed
            and self.marketplace_round_trip_passed
            and all(p.passed for p in self.per_jurisdiction)
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "out_zip": self.out_zip,
            "n_profiles": self.n_profiles,
            "per_jurisdiction": [p.to_dict() for p in self.per_jurisdiction],
            "cert_xml_passed": self.cert_xml_passed,
            "marketplace_round_trip_passed": self.marketplace_round_trip_passed,
            "manifest_sha256": self.manifest_sha256,
            "passed": self.passed,
        }


def _hash_bytes(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def _compliance_report_to_dict(rep: ComplianceReport) -> dict[str, Any]:
    """Serialize a ComplianceReport into a JSON-safe dict.

    The linter dataclass doesn't ship to_dict(); we hand-roll one
    that captures every field a regulator might need (jurisdiction,
    error/warning/info counts, full violations).
    """
    return {
        "jurisdiction": rep.jurisdiction,
        "is_compliant": rep.is_compliant,
        "auto_fixable": rep.auto_fixable,
        "error_count": rep.error_count,
        "warning_count": rep.warning_count,
        "info_count": rep.info_count,
        "violations": [
            {
                "rule_id": v.rule_id,
                "jurisdiction": v.jurisdiction,
                "severity": v.severity.value,
                "message": v.message,
                "field": v.field,
                "can_auto_fix": v.can_auto_fix,
            }
            for v in rep.violations
        ],
    }


def build_multi_territory_release(
    ir: dict[str, Any],
    *,
    profile_ids: list[str],
    out_dir: Path,
    mc_report: dict[str, Any] | None = None,
    profile_search_dir: Path | None = None,
    marketplace_dir: Path | None = None,
) -> MultiTerritoryReport:
    """Build a multi-territory release ZIP + run the end-to-end check.

    `profile_ids` matches names known to `tools.jurisdiction.linter.load_profile`.
    `out_dir` is the staging directory; the final ZIP is `out_dir / "release.zip"`.
    `marketplace_dir` is where the marketplace registry stores the published
    ZIP — defaults to `out_dir / "marketplace_registry"`.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    if marketplace_dir is None:
        marketplace_dir = out_dir / "marketplace_registry"

    meta = ir.get("meta") or {}
    game_id = str(meta.get("id", "unknown_game"))
    digest = ir_digest(ir)

    report = MultiTerritoryReport(
        game_id=game_id,
        out_zip=str(out_dir / "release.zip"),
        n_profiles=len(profile_ids),
    )

    # ─── 1) Per-profile compliance lint ────────────────────────────
    juris_dir = out_dir / "jurisdictions"
    juris_dir.mkdir(parents=True, exist_ok=True)
    cert_entries: list[JurisdictionEntry] = []
    for pid in profile_ids:
        prof = load_profile(pid, search_dir=profile_search_dir)
        rep: ComplianceReport = lint_ir(ir, prof)
        comp_path = juris_dir / f"{pid}.compliance.json"
        comp_path.write_text(json.dumps(_compliance_report_to_dict(rep),
                                          indent=2, sort_keys=True))
        n_err = sum(1 for v in rep.violations
                    if v.severity == ViolationSeverity.ERROR)
        n_warn = sum(1 for v in rep.violations
                     if v.severity == ViolationSeverity.WARNING)
        result = PerJurisdictionResult(
            profile_id=pid,
            compliance_path=str(comp_path.relative_to(out_dir)),
            passed=(n_err == 0),
            n_errors=n_err,
            n_warnings=n_warn,
            digest_for_cert=digest,
        )
        report.per_jurisdiction.append(result)
        cert_entries.append(JurisdictionEntry(
            id=pid,
            passed=(n_err == 0),
            profile_version=getattr(prof, "version", "1.0"),
            regulator_url="",
            ir_digest_sha256=digest,
            signature_b64="",
            notes=[getattr(prof, "name", pid)],
        ))

    # ─── 2) Cert XML v2 ───────────────────────────────────────────
    cert_path = out_dir / "cert.v2.xml"
    try:
        emit_cert_xml_v2(
            ir, cert_path,
            mc_report=mc_report,
            jurisdiction_reports=[
                {"profile_id": p.profile_id, "passed": p.passed,
                 "n_errors": p.n_errors, "n_warnings": p.n_warnings}
                for p in report.per_jurisdiction
            ],
            jurisdictions=cert_entries,
        )
        report.cert_xml_passed = cert_path.exists() and cert_path.stat().st_size > 0
    except Exception as e:  # noqa: BLE001
        cert_path.write_text(f"<!-- cert emit failed: {e} -->")
        report.cert_xml_passed = False

    # ─── 3) Stage IR + cert + lints into the ZIP ──────────────────
    ir_path = out_dir / "ir.json"
    ir_path.write_text(json.dumps(ir, indent=2, sort_keys=True))

    files_to_pack: list[tuple[Path, str]] = [
        (ir_path, "ir.json"),
        (cert_path, "cert.v2.xml"),
    ]
    for p in report.per_jurisdiction:
        full = out_dir / p.compliance_path
        files_to_pack.append((full, p.compliance_path))

    zip_path = out_dir / "release.zip"
    if zip_path.exists():
        zip_path.unlink()
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for src, arc in files_to_pack:
            zf.write(src, arcname=arc)

    # ─── 4) Marketplace round-trip ────────────────────────────────
    registry = FilesystemMarketplace(root=marketplace_dir)
    verifier = MarketplaceVerifier(registry=registry)
    download_dir = out_dir / "marketplace_download"
    download_dir.mkdir(parents=True, exist_ok=True)
    try:
        rt = verifier.round_trip(
            zip_path,
            plugin_id=game_id,
            version=meta.get("version", "1.0.0"),
            download_dir=download_dir,
        )
        report.marketplace_round_trip_passed = rt.passed
        marketplace_json = out_dir / "marketplace_verify.json"
        marketplace_json.write_text(
            json.dumps(rt.to_dict(), indent=2, sort_keys=True)
        )
        # Bundle the verifier report into the ZIP as well.
        with zipfile.ZipFile(zip_path, "a", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(marketplace_json, arcname="marketplace_verify.json")
    except Exception as e:  # noqa: BLE001
        report.marketplace_round_trip_passed = False
        (out_dir / "marketplace_verify.json").write_text(
            json.dumps({"error": str(e)}, indent=2)
        )

    # ─── 5) Manifest SHA-256 (post-marketplace bundling) ──────────
    final_blob = zip_path.read_bytes()
    report.manifest_sha256 = _hash_bytes(final_blob)
    (out_dir / "manifest.sha256.txt").write_text(report.manifest_sha256 + "\n")

    return report
