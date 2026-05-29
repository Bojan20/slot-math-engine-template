"""W51 — Cert XML Schema v2: Jurisdiction-Tagged Provenance.

Extends the W5.6+ XML cert (``urn:slotmath:cert:v1``) with per-
jurisdiction provenance branches under a new namespace
``urn:slotmath:cert:v2``. The v1 cert had a single ``<Provenance>``
element capturing one signature + Merkle root. v2 generalizes that:
each target jurisdiction gets its own ``<JurisdictionProvenance>``
branch with its own digest + signature + optional regulator-specific
metadata (regulator URL, profile_id, regulator-required disclosures).

The v2 cert is a strict superset: a v1 reader can still read all the
core sections (Meta, Topology, RtpReport, …). The v2-only additions
live under a new ``<MultiJurisdiction>`` element.

Use case
--------
A studio releasing a single SKU into UK + Malta + Ontario needs ONE
cert XML that proves the SAME IR was approved against three
jurisdiction profiles. Without v2 they would need three separate
cert ZIPs.

Public API:

    from tools.slot_build.cert_xml_v2 import (
        emit_cert_xml_v2,
        validate_cert_xml_v2,
        JurisdictionEntry,
    )
    path = emit_cert_xml_v2(
        ir, out_xml, mc_report=mc,
        jurisdictions=[
            JurisdictionEntry(id="ukgc", passed=True, ...),
            JurisdictionEntry(id="mga",  passed=True, ...),
        ],
    )

CLI:
    slot-cert-xml-v2 <ir.json> --out <out.xml>
        [--mc <mc.json>]
        [--juris-entry <id>:<json>]   # repeatable
        [--validate]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from tools.slot_build.cert_xml import (
    _build_meta,
    _build_topology,
    _build_limits,
    _build_rtp_report,
    _build_feature_breakdown,
    _build_jurisdictions,
)


NS_URI_V2 = "urn:slotmath:cert:v2"
NS_URI_V1 = "urn:slotmath:cert:v1"


def _e(tag: str, **attrs: Any) -> ET.Element:
    el = ET.Element(f"{{{NS_URI_V2}}}{tag}")
    for k, v in attrs.items():
        if v is None:
            continue
        el.set(k, str(v))
    return el


# ─── jurisdiction entry dataclass ──────────────────────────────────


@dataclass
class JurisdictionEntry:
    """One regulator profile's audit branch."""

    id: str
    passed: bool
    profile_version: str = ""
    regulator_url: str = ""
    ir_digest_sha256: str = ""           # SHA-256 of the IR bytes the
                                         # regulator approved (may differ
                                         # per-jurisdiction if any
                                         # market-specific tweaks
                                         # were applied)
    signature_b64: str = ""              # base64 ed25519 over digest
    signed_at_utc: str = ""
    notes: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "passed": bool(self.passed),
            "profile_version": self.profile_version,
            "regulator_url": self.regulator_url,
            "ir_digest_sha256": self.ir_digest_sha256,
            "signature_b64": self.signature_b64,
            "signed_at_utc": self.signed_at_utc,
            "notes": list(self.notes),
            "errors": list(self.errors),
            "warnings": list(self.warnings),
        }


def ir_digest(ir: dict[str, Any]) -> str:
    """Stable SHA-256 of the IR (sort_keys canonical JSON)."""
    blob = json.dumps(ir, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


# ─── builder ────────────────────────────────────────────────────────


def _build_multi_jurisdiction(
    entries: list[JurisdictionEntry],
) -> ET.Element:
    root = _e("MultiJurisdiction", count=len(entries))
    for jur in entries:
        el = _e(
            "JurisdictionProvenance",
            id=jur.id,
            passed=str(bool(jur.passed)).lower(),
            profile_version=jur.profile_version or None,
            regulator_url=jur.regulator_url or None,
            ir_digest_sha256=jur.ir_digest_sha256 or None,
            signature_b64=jur.signature_b64 or None,
            signed_at_utc=jur.signed_at_utc or None,
        )
        if jur.notes:
            notes_el = _e("Notes", count=len(jur.notes))
            for n in jur.notes:
                ne = _e("Note")
                ne.text = str(n)
                notes_el.append(ne)
            el.append(notes_el)
        if jur.errors:
            err_el = _e("Errors", count=len(jur.errors))
            for n in jur.errors:
                ne = _e("Error")
                ne.text = str(n)
                err_el.append(ne)
            el.append(err_el)
        if jur.warnings:
            wn_el = _e("Warnings", count=len(jur.warnings))
            for n in jur.warnings:
                ne = _e("Warning")
                ne.text = str(n)
                wn_el.append(ne)
            el.append(wn_el)
        root.append(el)
    return root


def emit_cert_xml_v2(
    ir: dict[str, Any],
    out_path: Path,
    *,
    mc_report: dict[str, Any] | None = None,
    jurisdiction_reports: list[dict[str, Any]] | None = None,
    jurisdictions: list[JurisdictionEntry] | None = None,
    provenance: dict[str, Any] | None = None,
) -> Path:
    """Emit a v2 cert XML.

    `jurisdiction_reports` carries the v1-style summary (used to
    populate <Jurisdictions> for backward compatibility); `jurisdictions`
    carries the new per-jurisdiction provenance branches.

    Either or both may be provided. If `jurisdictions` is omitted, v2
    XML degrades gracefully — it still parses but the
    <MultiJurisdiction> element is empty (count=0).
    """
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    root = _e(
        "SlotMathCert",
        cert_version="2.0",
        emitted_at=datetime.now(timezone.utc).isoformat(),
        v1_namespace=NS_URI_V1,
    )

    # ─── core sections borrowed from v1 ────────────────────────────
    # Convert v1-namespaced elements to v2-namespace by re-wrapping;
    # we keep the section names identical so a regulator's existing
    # parser can still walk them by tag.
    for build in (
        _build_meta(ir),
        _build_topology(ir),
        _build_limits(ir),
        _build_rtp_report(mc_report, ir),
        _build_feature_breakdown(ir, mc_report),
        _build_jurisdictions(jurisdiction_reports),
    ):
        # Strip v1 namespace and rename to v2.
        for el in build.iter():
            tag = el.tag
            if tag.startswith("{" + NS_URI_V1 + "}"):
                el.tag = "{" + NS_URI_V2 + "}" + tag.split("}", 1)[1]
        root.append(build)

    # ─── v2 additions ──────────────────────────────────────────────
    if provenance:
        prov_el = _e(
            "Provenance",
            ir_sha256=provenance.get("ir_sha256"),
            par_merkle_root=provenance.get("par_merkle_root"),
            signature=provenance.get("signature"),
        )
        root.append(prov_el)

    root.append(_build_multi_jurisdiction(list(jurisdictions or [])))

    notes = (ir.get("meta") or {}).get("notes") or []
    if notes:
        audit = _e("AuditTrail", count=len(notes))
        for n in notes:
            ne = _e("Note")
            ne.text = str(n)
            audit.append(ne)
        root.append(audit)

    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(out_path, encoding="utf-8", xml_declaration=True)
    return out_path


# ─── validator ────────────────────────────────────────────────────


REQUIRED_V2_TAGS = (
    "Meta",
    "Topology",
    "Limits",
    "RtpReport",
    "FeatureBreakdown",
    "Jurisdictions",
    "MultiJurisdiction",
)


def validate_cert_xml_v2(path: Path) -> dict[str, Any]:
    """Parse a v2 cert XML back; return a structural-sanity report.

    The dict contains:
        * ``passed`` (bool)
        * ``namespace`` (str)
        * ``cert_version`` (str)
        * ``sections`` (list of section tags found)
        * ``missing`` (list of REQUIRED_V2_TAGS not found)
        * ``jurisdiction_ids`` (list of <JurisdictionProvenance id="">)
        * ``errors`` (list of structural diagnostics)
    """
    path = Path(path)
    tree = ET.parse(path)
    root = tree.getroot()
    ns = root.tag[1:].split("}", 1)[0] if root.tag.startswith("{") else ""
    cert_version = root.attrib.get("cert_version", "")
    sections = []
    for child in list(root):
        if child.tag.startswith("{"):
            local = child.tag.split("}", 1)[1]
        else:
            local = child.tag
        sections.append(local)
    missing = [t for t in REQUIRED_V2_TAGS if t not in sections]
    juris_ids: list[str] = []
    mj = root.find(f"{{{NS_URI_V2}}}MultiJurisdiction")
    if mj is not None:
        for jp in mj.findall(f"{{{NS_URI_V2}}}JurisdictionProvenance"):
            jid = jp.attrib.get("id")
            if jid:
                juris_ids.append(jid)
    errors: list[str] = []
    if ns != NS_URI_V2:
        errors.append(f"unexpected namespace {ns!r} (expected {NS_URI_V2!r})")
    if missing:
        errors.append(f"missing sections: {missing}")
    return {
        "passed": not errors,
        "namespace": ns,
        "cert_version": cert_version,
        "sections": sections,
        "missing": missing,
        "jurisdiction_ids": juris_ids,
        "errors": errors,
    }


# ─── CLI ──────────────────────────────────────────────────────────


def _parse_juris_arg(arg: str) -> JurisdictionEntry:
    """Format ``<id>:<json>`` — e.g. ``ukgc:{"passed":true}``"""
    if ":" not in arg:
        raise argparse.ArgumentTypeError(
            f"--juris-entry expects '<id>:<json>', got {arg!r}"
        )
    id_part, json_part = arg.split(":", 1)
    payload = json.loads(json_part)
    return JurisdictionEntry(
        id=id_part,
        passed=bool(payload.get("passed", False)),
        profile_version=str(payload.get("profile_version", "")),
        regulator_url=str(payload.get("regulator_url", "")),
        ir_digest_sha256=str(payload.get("ir_digest_sha256", "")),
        signature_b64=str(payload.get("signature_b64", "")),
        signed_at_utc=str(payload.get("signed_at_utc", "")),
        notes=list(payload.get("notes", [])),
        errors=list(payload.get("errors", [])),
        warnings=list(payload.get("warnings", [])),
    )


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="slot-cert-xml-v2",
        description="Emit/validate the v2 cert XML (multi-jurisdiction).",
    )
    p.add_argument("ir", help="path to universal IR JSON")
    p.add_argument("--out", required=True, help="output XML path")
    p.add_argument("--mc", help="optional MC report JSON")
    p.add_argument(
        "--juris-entry",
        action="append",
        default=[],
        type=_parse_juris_arg,
        help="repeatable <id>:<json> jurisdiction provenance branch",
    )
    p.add_argument("--validate", action="store_true",
                   help="parse the emitted XML back and report")
    args = p.parse_args(argv)

    ir = json.loads(Path(args.ir).read_text())
    mc = json.loads(Path(args.mc).read_text()) if args.mc else None
    out = emit_cert_xml_v2(
        ir,
        Path(args.out),
        mc_report=mc,
        jurisdictions=list(args.juris_entry),
    )
    if args.validate:
        report = validate_cert_xml_v2(out)
        sys.stdout.write(json.dumps(report, indent=2) + "\n")
        return 0 if report["passed"] else 1
    sys.stdout.write(f"wrote {out}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
