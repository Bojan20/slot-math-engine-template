"""PHASE 34 — Cert XML v3 emitter + validator."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from typing import Any


_NS = "urn:slotmath:cert:v3"


@dataclass
class CertV3Input:
    game_id: str
    swid: str
    target_rtp: float
    measured_rtp: float
    reels: int
    rows: int
    par_merkle_root_hex: str = ""
    theorem_prover_cert_hashes: list[str] = field(default_factory=list)
    federated_audit_transcript_hash: str = ""
    dp_export_log: list[tuple[str, float, float]] = field(default_factory=list)
    type_check_passed: bool = True
    jurisdictions: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass
class CertV3ValidationReport:
    schema_version: str = "urn:slotmath:cert:v3-validator:v1"
    passed: bool = True
    sections_found: list[str] = field(default_factory=list)
    issues: list[str] = field(default_factory=list)


_REQUIRED_SECTIONS = (
    "Meta",
    "Topology",
    "Rtp",
    "ParProvenance",
    "TheoremCerts",
    "FederatedAudit",
    "DpExportLog",
    "TypeCheck",
    "Jurisdictions",
    "Notes",
)


def emit_cert_xml_v3(input: CertV3Input) -> str:
    """Emit cert XML v3 as a string (UTF-8 XML)."""
    ET.register_namespace("", _NS)
    root = ET.Element(f"{{{_NS}}}CertV3")

    meta = ET.SubElement(root, f"{{{_NS}}}Meta")
    ET.SubElement(meta, f"{{{_NS}}}GameId").text = input.game_id
    ET.SubElement(meta, f"{{{_NS}}}Swid").text = input.swid

    topo = ET.SubElement(root, f"{{{_NS}}}Topology")
    ET.SubElement(topo, f"{{{_NS}}}Reels").text = str(input.reels)
    ET.SubElement(topo, f"{{{_NS}}}Rows").text = str(input.rows)

    rtp = ET.SubElement(root, f"{{{_NS}}}Rtp")
    ET.SubElement(rtp, f"{{{_NS}}}Target").text = f"{input.target_rtp}"
    ET.SubElement(rtp, f"{{{_NS}}}Measured").text = f"{input.measured_rtp}"

    par = ET.SubElement(root, f"{{{_NS}}}ParProvenance")
    ET.SubElement(par, f"{{{_NS}}}MerkleRootHex").text = input.par_merkle_root_hex

    tcerts = ET.SubElement(root, f"{{{_NS}}}TheoremCerts")
    for h in input.theorem_prover_cert_hashes:
        ET.SubElement(tcerts, f"{{{_NS}}}CertHash").text = h

    fed = ET.SubElement(root, f"{{{_NS}}}FederatedAudit")
    ET.SubElement(fed, f"{{{_NS}}}TranscriptHash").text = input.federated_audit_transcript_hash

    dpel = ET.SubElement(root, f"{{{_NS}}}DpExportLog")
    for label, eps, delta in input.dp_export_log:
        q = ET.SubElement(dpel, f"{{{_NS}}}Query")
        q.set("epsilon", f"{eps}")
        q.set("delta", f"{delta}")
        q.text = label

    tc = ET.SubElement(root, f"{{{_NS}}}TypeCheck")
    ET.SubElement(tc, f"{{{_NS}}}Passed").text = "true" if input.type_check_passed else "false"

    jurs = ET.SubElement(root, f"{{{_NS}}}Jurisdictions")
    for j in input.jurisdictions:
        ET.SubElement(jurs, f"{{{_NS}}}Jurisdiction").text = j

    notes = ET.SubElement(root, f"{{{_NS}}}Notes")
    for n in input.notes:
        ET.SubElement(notes, f"{{{_NS}}}Note").text = n

    try:
        ET.indent(root, space="  ")
    except AttributeError:
        pass
    xml_bytes = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    return xml_bytes.decode("utf-8")


def validate_cert_xml_v3(xml_str: str) -> CertV3ValidationReport:
    report = CertV3ValidationReport()
    try:
        root = ET.fromstring(xml_str)
    except ET.ParseError as exc:
        report.passed = False
        report.issues.append(f"parse_error: {exc}")
        return report
    if root.tag != f"{{{_NS}}}CertV3":
        report.passed = False
        report.issues.append(f"root tag mismatch: {root.tag}")
    for section in _REQUIRED_SECTIONS:
        found = root.find(f"{{{_NS}}}{section}")
        if found is None:
            report.passed = False
            report.issues.append(f"missing section: {section}")
        else:
            report.sections_found.append(section)
    return report
