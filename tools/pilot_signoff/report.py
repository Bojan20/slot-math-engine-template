"""Pilot sign-off report — aggregate onboard + cert + jurisdiction."""
from __future__ import annotations
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class PilotSignoffReport:
    game_id: str
    vendor: str
    swid: str
    target_rtp: float | None
    ir_digest_sha256: str
    cert_digest_match: bool
    onboard_passed: bool
    onboard_steps: list[dict[str, Any]] = field(default_factory=list)
    jurisdictions: list[dict[str, Any]] = field(default_factory=list)
    manifest_files: list[dict[str, Any]] = field(default_factory=list)
    generated_at_utc: str = ""

    @property
    def n_jurisdictions(self) -> int:
        return len(self.jurisdictions)

    @property
    def n_failing_jurisdictions(self) -> int:
        return sum(1 for j in self.jurisdictions if not j.get("passed"))

    @property
    def passed(self) -> bool:
        return (
            self.onboard_passed
            and self.cert_digest_match
            and self.n_failing_jurisdictions == 0
            and self.n_jurisdictions > 0
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "vendor": self.vendor,
            "swid": self.swid,
            "target_rtp": self.target_rtp,
            "ir_digest_sha256": self.ir_digest_sha256,
            "cert_digest_match": self.cert_digest_match,
            "onboard_passed": self.onboard_passed,
            "n_jurisdictions": self.n_jurisdictions,
            "n_failing_jurisdictions": self.n_failing_jurisdictions,
            "passed": self.passed,
            "onboard_steps": list(self.onboard_steps),
            "jurisdictions": list(self.jurisdictions),
            "manifest_files": list(self.manifest_files),
            "generated_at_utc": self.generated_at_utc,
        }


# ─── Parsers ───────────────────────────────────────────────────────


_STEP_ROW = re.compile(
    r"\|\s*\d+\s*\|\s*`([^`]+)`\s*\|\s*([✅🔴])\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|"
)


def _parse_onboard_md(text: str) -> list[dict[str, Any]]:
    steps: list[dict[str, Any]] = []
    for m in _STEP_ROW.finditer(text):
        name, flag, detail, artifact = m.group(1), m.group(2), m.group(3), m.group(4)
        steps.append({
            "name": name,
            "ok": flag == "✅",
            "detail": detail.strip(),
            "artifact": artifact.strip().strip("`"),
        })
    return steps


def _digest_from_cert(cert_path: Path) -> str:
    """Pull the IR digest published in cert.v2.xml (W51 emits it under
    Provenance/ir_sha256, or via JurisdictionProvenance entries)."""
    try:
        tree = ET.parse(cert_path)
    except (ET.ParseError, FileNotFoundError):
        return ""
    root = tree.getroot()
    # Strip namespace prefix for tag matching
    def localname(el):
        return el.tag.split("}", 1)[1] if "}" in el.tag else el.tag
    for el in root.iter():
        if localname(el) == "Provenance":
            ds = el.get("ir_sha256") or el.get("ir_digest_sha256")
            if ds:
                return ds
        if localname(el) == "JurisdictionProvenance":
            ds = el.get("ir_digest_sha256") or el.get("ir_sha256")
            if ds:
                return ds
    return ""


def _sha256_file(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# ─── Builder ───────────────────────────────────────────────────────


def build_signoff(
    *,
    pilot_dir: Path,
    multi_territory_dir: Path | None = None,
    ir_filename: str = "ir.json",
    cert_filename: str = "cert.v2.xml",
    onboard_report_filename: str = "ONBOARD_REPORT.md",
    manifest_filename: str = "MANIFEST.json",
) -> PilotSignoffReport:
    pilot_dir = Path(pilot_dir)
    ir_path = pilot_dir / ir_filename
    cert_path = pilot_dir / cert_filename
    onboard_path = pilot_dir / onboard_report_filename
    manifest_path = pilot_dir / manifest_filename

    ir_data: dict[str, Any] = {}
    if ir_path.exists():
        try:
            ir_data = json.loads(ir_path.read_text())
        except json.JSONDecodeError:
            ir_data = {}
    meta = ir_data.get("meta") or {}

    ir_digest = _sha256_file(ir_path) if ir_path.exists() else ""
    cert_digest = _digest_from_cert(cert_path) if cert_path.exists() else ""
    # The cert v2 emitter recomputes its OWN digest of the IR; we
    # accept a match if either the file-bytes digest OR the cert's
    # canonical digest agrees.
    digest_match = False
    if cert_path.exists():
        # Also try the canonical digest via cert_xml_v2.ir_digest
        try:
            from tools.slot_build.cert_xml_v2 import ir_digest as canonical_digest
            canonical = canonical_digest(ir_data)
        except Exception:
            canonical = ""
        digest_match = bool(cert_digest) and (
            cert_digest == ir_digest or cert_digest == canonical
        )

    onboard_steps: list[dict[str, Any]] = []
    onboard_passed = False
    if onboard_path.exists():
        text = onboard_path.read_text()
        onboard_steps = _parse_onboard_md(text)
        onboard_passed = bool(onboard_steps) and all(
            s["ok"] for s in onboard_steps
        )

    manifest_files: list[dict[str, Any]] = []
    if manifest_path.exists():
        try:
            mf = json.loads(manifest_path.read_text())
            manifest_files = list(mf.get("files") or [])
        except json.JSONDecodeError:
            manifest_files = []

    jurisdictions: list[dict[str, Any]] = []
    if multi_territory_dir is not None:
        juris_dir = Path(multi_territory_dir) / "jurisdictions"
        if juris_dir.exists():
            for p in sorted(juris_dir.glob("*.compliance.json")):
                try:
                    data = json.loads(p.read_text())
                except json.JSONDecodeError:
                    continue
                jurisdictions.append({
                    "profile_id": p.stem.replace(".compliance", ""),
                    "passed": bool(data.get("is_compliant", True)),
                    "errors": int(data.get("error_count", 0)),
                    "warnings": int(data.get("warning_count", 0)),
                    "info": int(data.get("info_count", 0)),
                })

    return PilotSignoffReport(
        game_id=str(meta.get("id", "unknown")),
        vendor=str(meta.get("vendor", "unknown")),
        swid=str(meta.get("swid", "unknown")),
        target_rtp=(
            float(meta["target_rtp"])
            if isinstance(meta.get("target_rtp"), (int, float)) else None
        ),
        ir_digest_sha256=ir_digest,
        cert_digest_match=digest_match,
        onboard_passed=onboard_passed,
        onboard_steps=onboard_steps,
        jurisdictions=jurisdictions,
        manifest_files=manifest_files,
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
    )


# ─── ANSI renderer ─────────────────────────────────────────────────


_BOX_WIDTH = 78


def _hr(ch: str = "─") -> str:
    return ch * _BOX_WIDTH


def _line(text: str) -> str:
    return f" {text}"


def _pad_right(text: str, width: int) -> str:
    if len(text) >= width:
        return text[: width - 1] + "…"
    return text + " " * (width - len(text))


def render_ansi(report: PilotSignoffReport) -> str:
    lines: list[str] = []
    lines.append("=" * _BOX_WIDTH)
    lines.append("           SLOT-MATH PILOT SIGN-OFF REPORT")
    lines.append("=" * _BOX_WIDTH)
    lines.append("")
    lines.append(f" Generated: {report.generated_at_utc}")
    lines.append("")
    lines.append(_hr())
    lines.append(" GAME META")
    lines.append(_hr())
    lines.append(_line(f"Game ID         : {report.game_id}"))
    lines.append(_line(f"Vendor          : {report.vendor}"))
    lines.append(_line(f"SWID            : {report.swid}"))
    lines.append(_line(
        f"Target RTP      : {report.target_rtp:.4f}"
        if report.target_rtp is not None else " Target RTP      : —"
    ))
    lines.append("")

    lines.append(_hr())
    lines.append(" INTEGRITY")
    lines.append(_hr())
    lines.append(_line(f"IR digest SHA-256: {report.ir_digest_sha256}"))
    lines.append(_line(
        f"Cert digest match: {'YES ✅' if report.cert_digest_match else 'NO 🔴'}"
    ))
    lines.append(_line(
        f"Onboard pipeline : "
        f"{'PASS ✅' if report.onboard_passed else 'FAIL 🔴'}"
    ))
    lines.append("")

    lines.append(_hr())
    lines.append(" ONBOARDING STEP LEDGER")
    lines.append(_hr())
    if report.onboard_steps:
        for s in report.onboard_steps:
            flag = "✅" if s.get("ok") else "🔴"
            name = _pad_right(str(s.get("name", "")), 22)
            detail = _pad_right(str(s.get("detail", "")), 36)
            lines.append(_line(f"{flag} {name} {detail}"))
    else:
        lines.append(_line("(no onboard steps found)"))
    lines.append("")

    lines.append(_hr())
    lines.append(" JURISDICTION COMPLIANCE")
    lines.append(_hr())
    if report.jurisdictions:
        for j in report.jurisdictions:
            flag = "✅" if j.get("passed") else "🔴"
            pid = _pad_right(str(j.get("profile_id", "")), 20)
            errs = int(j.get("errors", 0))
            warns = int(j.get("warnings", 0))
            info = int(j.get("info", 0))
            lines.append(_line(
                f"{flag} {pid}  errors={errs:>3}  "
                f"warnings={warns:>3}  info={info:>3}"
            ))
    else:
        lines.append(_line("(no jurisdiction profiles attached)"))
    lines.append("")

    lines.append(_hr())
    lines.append(" ARTIFACT MANIFEST")
    lines.append(_hr())
    if report.manifest_files:
        for f in report.manifest_files[:20]:
            name = _pad_right(str(f.get("name", "")), 32)
            size = int(f.get("size_bytes", 0))
            digest = str(f.get("sha256", ""))[:16] + "…"
            lines.append(_line(f"{name}  {size:>10}b  {digest}"))
        if len(report.manifest_files) > 20:
            lines.append(_line(
                f"… {len(report.manifest_files) - 20} more files in MANIFEST.json"
            ))
    else:
        lines.append(_line("(no manifest)"))
    lines.append("")

    lines.append("=" * _BOX_WIDTH)
    verdict = "PASS  ✅  READY FOR REGULATOR" if report.passed \
              else "FAIL  🔴  BLOCKED"
    lines.append(f"           VERDICT: {verdict}")
    lines.append("=" * _BOX_WIDTH)
    lines.append("")
    lines.append(_line("Studio sign-off (printed name + signature + date):"))
    lines.append(_line("  Name: ____________________________________________"))
    lines.append(_line("  Signature: _______________________________________"))
    lines.append(_line("  Date: ____________________________________________"))
    lines.append("")
    lines.append(_line("Regulator counter-signature (regulator id + date):"))
    lines.append(_line("  Regulator: _______________________________________"))
    lines.append(_line("  Signature: _______________________________________"))
    lines.append(_line("  Date: ____________________________________________"))
    lines.append("")
    return "\n".join(lines) + "\n"
