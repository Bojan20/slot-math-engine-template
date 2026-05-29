"""Cert XML standalone verifier (W56).

Pure-Python, std-lib only. Optional ed25519 signature check uses
`cryptography` (already a top-level dependency for W5.6 cert ZIPs).
"""
from __future__ import annotations
import base64
import json
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from tools.slot_build.cert_xml import NS_URI as NS_V1
from tools.slot_build.cert_xml_v2 import (
    NS_URI_V2 as NS_V2,
    REQUIRED_V2_TAGS,
    ir_digest as _ir_digest_v2,
    validate_cert_xml_v2,
)


REQUIRED_V1_TAGS = (
    "Meta",
    "Topology",
    "Limits",
    "RtpReport",
    "FeatureBreakdown",
    "Jurisdictions",
    "Provenance",
)


class CertVerdict(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    ERROR = "error"


@dataclass
class CertXmlReport:
    path: str
    cert_version: str = ""
    namespace: str = ""
    detected_schema: str = ""        # "v1" | "v2" | "unknown"
    sections: list[str] = field(default_factory=list)
    missing_sections: list[str] = field(default_factory=list)
    jurisdiction_ids: list[str] = field(default_factory=list)
    ir_digest_matches: bool | None = None
    signature_verified: bool | None = None
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    @property
    def verdict(self) -> CertVerdict:
        if self.errors:
            return CertVerdict.FAIL
        return CertVerdict.PASS

    def to_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "cert_version": self.cert_version,
            "namespace": self.namespace,
            "detected_schema": self.detected_schema,
            "sections": list(self.sections),
            "missing_sections": list(self.missing_sections),
            "jurisdiction_ids": list(self.jurisdiction_ids),
            "ir_digest_matches": self.ir_digest_matches,
            "signature_verified": self.signature_verified,
            "errors": list(self.errors),
            "warnings": list(self.warnings),
            "verdict": self.verdict.value,
        }


# ─── helpers ────────────────────────────────────────────────────────


def _detect_schema(ns: str) -> str:
    if ns == NS_V1:
        return "v1"
    if ns == NS_V2:
        return "v2"
    return "unknown"


def _local_sections(root: ET.Element) -> list[str]:
    out = []
    for child in list(root):
        tag = child.tag
        if tag.startswith("{"):
            tag = tag.split("}", 1)[1]
        out.append(tag)
    return out


def _find(root: ET.Element, ns: str, local: str) -> ET.Element | None:
    return root.find(f"{{{ns}}}{local}")


def _findall(root: ET.Element, ns: str, local: str) -> list[ET.Element]:
    return root.findall(f"{{{ns}}}{local}")


# ─── core verifier ──────────────────────────────────────────────────


def verify_cert_xml(path: Path) -> CertXmlReport:
    """Structural + namespace verification of a cert XML.

    Does NOT check the IR digest (caller must supply IR via
    ``verify_cert_xml_against_ir``) and does NOT verify ed25519
    signatures (use ``verify_signature_b64`` for that).
    """
    path = Path(path)
    report = CertXmlReport(path=str(path))
    if not path.exists():
        report.errors.append(f"cert file missing: {path}")
        return report
    try:
        tree = ET.parse(path)
    except ET.ParseError as e:
        report.errors.append(f"XML parse error: {e}")
        return report
    root = tree.getroot()
    ns = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
    report.namespace = ns
    report.cert_version = root.attrib.get("cert_version", "")
    schema = _detect_schema(ns)
    report.detected_schema = schema
    if schema == "unknown":
        report.errors.append(f"unrecognized namespace: {ns!r}")
        return report

    sections = _local_sections(root)
    report.sections = sections
    required = REQUIRED_V2_TAGS if schema == "v2" else REQUIRED_V1_TAGS
    missing = [t for t in required if t not in sections]
    report.missing_sections = missing
    if missing:
        report.errors.append(f"missing required sections: {missing}")

    # Multi-jurisdiction extraction (v2 only)
    if schema == "v2":
        mj = _find(root, NS_V2, "MultiJurisdiction")
        if mj is not None:
            for jp in _findall(mj, NS_V2, "JurisdictionProvenance"):
                jid = jp.attrib.get("id")
                if jid:
                    report.jurisdiction_ids.append(jid)
        # Cross-check v2 validator agrees
        v2report = validate_cert_xml_v2(path)
        if not v2report.get("passed", False):
            # Promote v2 validator errors to ours if they add detail.
            for err in v2report.get("errors", []):
                if err and err not in report.errors:
                    report.warnings.append(f"v2-validator: {err}")
    else:  # v1
        # v1 has flat <Jurisdictions> with <Profile id=…>
        jur = _find(root, NS_V1, "Jurisdictions")
        if jur is not None:
            for p in _findall(jur, NS_V1, "Profile"):
                jid = p.attrib.get("id")
                if jid:
                    report.jurisdiction_ids.append(jid)

    return report


def _gather_ir_digest_targets(path: Path) -> list[tuple[str, str]]:
    """Return list of (location_label, sha256_hex) candidates pulled
    from the XML — covers v1 ``<Provenance ir_sha256=…>`` and v2
    per-jurisdiction ``<JurisdictionProvenance ir_digest_sha256=…>``."""
    out: list[tuple[str, str]] = []
    tree = ET.parse(path)
    root = tree.getroot()
    ns = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
    if ns == NS_V1:
        prov = _find(root, NS_V1, "Provenance")
        if prov is not None and prov.attrib.get("ir_sha256"):
            out.append(("v1.Provenance.ir_sha256", prov.attrib["ir_sha256"]))
    elif ns == NS_V2:
        prov = _find(root, NS_V2, "Provenance")
        if prov is not None and prov.attrib.get("ir_sha256"):
            out.append(("v2.Provenance.ir_sha256", prov.attrib["ir_sha256"]))
        mj = _find(root, NS_V2, "MultiJurisdiction")
        if mj is not None:
            for jp in _findall(mj, NS_V2, "JurisdictionProvenance"):
                jid = jp.attrib.get("id", "?")
                d = jp.attrib.get("ir_digest_sha256")
                if d:
                    out.append((f"v2.{jid}.ir_digest_sha256", d))
    return out


def verify_cert_xml_against_ir(
    cert_path: Path,
    ir_path: Path,
    *,
    report: CertXmlReport | None = None,
) -> CertXmlReport:
    """Cross-check the IR file matches every digest baked into the
    cert XML (Provenance + every JurisdictionProvenance branch)."""
    if report is None:
        report = verify_cert_xml(cert_path)
    if report.errors and report.detected_schema == "unknown":
        return report
    try:
        ir = json.loads(Path(ir_path).read_text())
    except (FileNotFoundError, json.JSONDecodeError) as e:
        report.errors.append(f"IR load error: {e}")
        report.ir_digest_matches = False
        return report
    expected = _ir_digest_v2(ir)
    targets = _gather_ir_digest_targets(Path(cert_path))
    if not targets:
        # No digests in the cert — degrade to a warning, not a fail.
        report.warnings.append("cert XML carries no IR digest fields")
        report.ir_digest_matches = None
        return report
    mismatches: list[str] = []
    for label, hexv in targets:
        if hexv.lower() != expected.lower():
            mismatches.append(f"{label}: expected {expected[:16]}…, "
                              f"cert has {hexv[:16]}…")
    if mismatches:
        report.errors.extend(mismatches)
        report.ir_digest_matches = False
    else:
        report.ir_digest_matches = True
    return report


def verify_signature_b64(
    payload: bytes,
    signature_b64: str,
    public_key_pem: bytes,
) -> bool:
    """ed25519 verification helper. Returns True on valid signature."""
    try:
        from cryptography.hazmat.primitives import serialization
        from cryptography.exceptions import InvalidSignature
    except ImportError:  # pragma: no cover
        return False
    try:
        pk = serialization.load_pem_public_key(public_key_pem)
        sig = base64.b64decode(signature_b64)
        pk.verify(sig, payload)
        return True
    except (InvalidSignature, ValueError):
        return False
    except Exception:  # noqa: BLE001
        return False


def _xml_signatures(cert_path: Path) -> list[tuple[str, str]]:
    """Pull (label, signature_b64) tuples from the cert XML for any
    v2 JurisdictionProvenance with a signature attribute set."""
    out: list[tuple[str, str]] = []
    tree = ET.parse(cert_path)
    root = tree.getroot()
    ns = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
    if ns == NS_V2:
        mj = _find(root, NS_V2, "MultiJurisdiction")
        if mj is not None:
            for jp in _findall(mj, NS_V2, "JurisdictionProvenance"):
                jid = jp.attrib.get("id", "?")
                sig = jp.attrib.get("signature_b64")
                if sig:
                    out.append((jid, sig))
    return out


def verify_cert_xml_signatures(
    cert_path: Path,
    public_key_pem: bytes,
    *,
    payload: bytes | None = None,
    report: CertXmlReport | None = None,
) -> CertXmlReport:
    """Verify every per-jurisdiction signature in the cert XML using
    a shared public key. If ``payload`` is None, falls back to the
    ir_digest_sha256 hex string per branch (matches what the v2 emitter
    signs by default)."""
    if report is None:
        report = verify_cert_xml(cert_path)
    sigs = _xml_signatures(cert_path)
    if not sigs:
        report.warnings.append("no per-jurisdiction signatures present")
        report.signature_verified = None
        return report
    all_ok = True
    for label, sig in sigs:
        target = payload if payload is not None else label.encode("utf-8")
        ok = verify_signature_b64(target, sig, public_key_pem)
        if not ok:
            all_ok = False
            report.errors.append(f"signature invalid for jurisdiction {label!r}")
    report.signature_verified = all_ok
    return report
