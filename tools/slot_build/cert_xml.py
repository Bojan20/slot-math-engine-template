"""W5.6+ — Regulator-grade XML cert output (GLI-16 Appendix D shape).

Companion to `tools.slot_build.cert_package` which emits a signed ZIP +
verify.sh shell script (operator-facing). Many regulators (especially
GLI-16, MGA, GLI-19) accept or require a structured XML submission
that mirrors the same audit trail in a machine-parseable form.

This module emits a single self-validating XML file:

    <SlotMathCert
        xmlns="urn:slotmath:cert:v1"
        cert_version="1.0"
        emitted_at="2026-05-26T..."
    >
      <Meta name="..." vendor="..." swid="..." version="..."/>
      <Topology reels="5" rows="3" paylines="20"/>
      <Limits max_win_x="..." min_spin_duration_ms="..."/>
      <RtpReport
        target="0.96"
        measured="0.9601"
        delta="0.0001"
        sample_size="10000000"
        hit_freq="0.27"
        win_freq="0.22"
      />
      <FeatureBreakdown>
        <Feature kind="free_spins" rtp_contribution="0.10" trigger_rate="0.014"/>
        ...
      </FeatureBreakdown>
      <Jurisdictions>
        <Profile id="ukgc" passed="true" errors="0" warnings="2"/>
        ...
      </Jurisdictions>
      <Provenance ir_sha256="..." par_merkle_root="..." signature="..."/>
      <AuditTrail>
        <Note>...</Note>
      </AuditTrail>
    </SlotMathCert>

NOT signed via ed25519 here — XML is meant to live alongside the
signed ZIP (the ZIP carries the signature; this XML is the
machine-parseable index regulators ingest).

Public API:
    from tools.slot_build.cert_xml import emit_cert_xml
    path = emit_cert_xml(ir, mc_report, jurisdiction_reports, out_path)

CLI:
    slot-cert-xml <ir.json>
        [--mc <mc-report.json>]
        [--juris <jurisdiction-report.json>]
        [--out <out.xml>]
        [--validate]   # parse the emitted XML back, sanity-check shape
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


NS_URI = "urn:slotmath:cert:v1"


def _e(tag: str, **attrs: Any) -> ET.Element:
    """Create an Element under the slotmath namespace.

    Attrs are stringified; None values are dropped.
    """
    el = ET.Element(f"{{{NS_URI}}}{tag}")
    for k, v in attrs.items():
        if v is None:
            continue
        el.set(k, str(v))
    return el


def _fmt(v: Any) -> str | None:
    """Stringify scalar values, drop Nones."""
    if v is None:
        return None
    if isinstance(v, float):
        return f"{v:.6f}"
    return str(v)


def _build_meta(ir: dict[str, Any]) -> ET.Element:
    meta = ir.get("meta") or {}
    return _e(
        "Meta",
        name=meta.get("name"),
        vendor=meta.get("vendor"),
        swid=meta.get("swid"),
        version=meta.get("version"),
    )


def _build_topology(ir: dict[str, Any]) -> ET.Element:
    topo = ir.get("topology") or {}
    ev = ir.get("evaluation") or {}
    paylines = ev.get("paylines") or ev.get("lines") or []
    return _e(
        "Topology",
        reels=topo.get("reels"),
        rows=topo.get("rows"),
        paylines=len(paylines) if paylines else topo.get("paylines"),
        kind=topo.get("kind"),
    )


def _build_limits(ir: dict[str, Any]) -> ET.Element:
    limits = ir.get("limits") or {}
    el = _e(
        "Limits",
        max_win_x=_fmt(limits.get("max_win_x")),
        min_spin_duration_ms=_fmt(limits.get("min_spin_duration_ms")),
        max_stake=_fmt(limits.get("max_stake")),
    )
    return el


def _build_rtp_report(mc: dict[str, Any] | None,
                      ir: dict[str, Any]) -> ET.Element:
    target = (ir.get("meta") or {}).get("target_rtp")
    if not mc:
        return _e("RtpReport", target=_fmt(target))
    measured = mc.get("rtp") or mc.get("measured_rtp")
    sample = mc.get("spins") or mc.get("sample_size")
    delta = None
    if isinstance(measured, (int, float)) and isinstance(target, (int, float)):
        delta = abs(float(measured) - float(target))
    return _e(
        "RtpReport",
        target=_fmt(target),
        measured=_fmt(measured),
        delta=_fmt(delta),
        sample_size=_fmt(sample),
        hit_freq=_fmt(mc.get("hit_freq")),
        win_freq=_fmt(mc.get("win_freq")),
        volatility=_fmt(mc.get("volatility")),
    )


def _build_feature_breakdown(ir: dict[str, Any],
                              mc: dict[str, Any] | None) -> ET.Element:
    root = _e("FeatureBreakdown")
    feats = ir.get("features") or []
    rtp_breakdown = (mc or {}).get("per_feature_rtp") or {}
    trigger_rates = (mc or {}).get("per_feature_trigger") or {}
    # Features may be a list of dicts or a dict {kind: cfg}; we accept both.
    if isinstance(feats, dict):
        items = list(feats.items())
    else:
        items = [(f.get("kind") or f.get("type") or "?", f) for f in feats]
    for kind, _cfg in items:
        root.append(_e(
            "Feature",
            kind=kind,
            rtp_contribution=_fmt(rtp_breakdown.get(kind)),
            trigger_rate=_fmt(trigger_rates.get(kind)),
        ))
    return root


def _build_jurisdictions(
    juris_reports: list[dict[str, Any]] | None,
) -> ET.Element:
    root = _e("Jurisdictions")
    for r in juris_reports or []:
        # Accept ComplianceReport dict shape or summary dict.
        passed = r.get("passed")
        if passed is None:
            errors = r.get("errors")
            if isinstance(errors, list):
                passed = len(errors) == 0
            else:
                passed = (errors or 0) == 0
        errors_n = r.get("error_count")
        if errors_n is None:
            errors_l = r.get("errors")
            errors_n = len(errors_l) if isinstance(errors_l, list) else errors_l or 0
        warnings_n = r.get("warning_count")
        if warnings_n is None:
            warnings_l = r.get("warnings")
            warnings_n = (
                len(warnings_l) if isinstance(warnings_l, list) else warnings_l or 0
            )
        root.append(_e(
            "Profile",
            id=r.get("profile_id") or r.get("id"),
            name=r.get("profile_name") or r.get("name"),
            passed=str(bool(passed)).lower(),
            errors=errors_n,
            warnings=warnings_n,
        ))
    return root


def _build_provenance(provenance: dict[str, Any] | None) -> ET.Element:
    if not provenance:
        return _e("Provenance")
    return _e(
        "Provenance",
        ir_sha256=provenance.get("ir_sha256"),
        par_merkle_root=provenance.get("par_merkle_root"),
        signature=provenance.get("signature"),
        signed_by=provenance.get("signed_by"),
        signed_at=provenance.get("signed_at"),
    )


def _build_audit_trail(ir: dict[str, Any]) -> ET.Element:
    root = _e("AuditTrail")
    notes = ((ir.get("meta") or {}).get("notes") or [])
    for note in notes:
        n = ET.SubElement(root, f"{{{NS_URI}}}Note")
        n.text = str(note)
    return root


def build_cert_tree(
    ir: dict[str, Any],
    mc_report: dict[str, Any] | None = None,
    jurisdiction_reports: list[dict[str, Any]] | None = None,
    provenance: dict[str, Any] | None = None,
) -> ET.ElementTree:
    """Build the SlotMathCert XML tree for the given inputs.

    Returns a tree that can be serialized via `.write(out_path)` or
    `ET.tostring(root, ...)`. All children are namespace-tagged
    (`{urn:slotmath:cert:v1}…`) so downstream consumers can validate
    against a schema in that URI.
    """
    root = _e(
        "SlotMathCert",
        cert_version="1.0",
        emitted_at=datetime.now(timezone.utc).isoformat(),
    )
    root.append(_build_meta(ir))
    root.append(_build_topology(ir))
    root.append(_build_limits(ir))
    root.append(_build_rtp_report(mc_report, ir))
    root.append(_build_feature_breakdown(ir, mc_report))
    root.append(_build_jurisdictions(jurisdiction_reports))
    root.append(_build_provenance(provenance))
    root.append(_build_audit_trail(ir))
    return ET.ElementTree(root)


def emit_cert_xml(
    ir: dict[str, Any],
    out_path: Path,
    *,
    mc_report: dict[str, Any] | None = None,
    jurisdiction_reports: list[dict[str, Any]] | None = None,
    provenance: dict[str, Any] | None = None,
) -> Path:
    """Build + write the regulator XML to `out_path`. Returns the path."""
    tree = build_cert_tree(
        ir,
        mc_report=mc_report,
        jurisdiction_reports=jurisdiction_reports,
        provenance=provenance,
    )
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # ET.indent provides pretty-print (Python 3.9+)
    try:
        ET.indent(tree, space="  ")
    except AttributeError:
        pass
    # Register the slotmath namespace globally so ElementTree emits
    # `xmlns="urn:slotmath:cert:v1"` on the root rather than `ns0:`
    # prefixes. `default_namespace=` would also do this but it
    # collides with text-only children (e.g. <Note>); registering up-
    # front is the standard pattern.
    ET.register_namespace("", NS_URI)
    tree.write(out_path, encoding="utf-8", xml_declaration=True)
    return out_path


def validate_cert_xml(path: Path) -> dict[str, Any]:
    """Lightweight structural validation — does the emitted XML have
    every required section + valid namespace?

    Returns a dict `{passed: bool, sections_found: [...], issues: [...]}`.
    Does NOT require an XSD or external library; this is a smoke gate
    that catches "I forgot to emit Topology" kind of regressions.
    """
    issues: list[str] = []
    sections_found: list[str] = []
    try:
        tree = ET.parse(str(path))
    except ET.ParseError as e:
        return {"passed": False, "sections_found": [],
                "issues": [f"parse error: {e}"]}
    root = tree.getroot()
    expected_tag = f"{{{NS_URI}}}SlotMathCert"
    if root.tag != expected_tag:
        issues.append(f"root tag is {root.tag}, expected {expected_tag}")
    # Required child sections
    for required in (
        "Meta", "Topology", "Limits", "RtpReport",
        "FeatureBreakdown", "Jurisdictions", "Provenance", "AuditTrail",
    ):
        child = root.find(f"{{{NS_URI}}}{required}")
        if child is None:
            issues.append(f"missing required section: {required}")
        else:
            sections_found.append(required)
    return {
        "passed": not issues,
        "sections_found": sections_found,
        "issues": issues,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="slot-cert-xml",
        description="Emit a regulator-grade XML cert (GLI-16 Appendix D "
                    "shape) from an IR + optional MC + jurisdiction reports.",
    )
    ap.add_argument("ir", help="path to IR JSON file")
    ap.add_argument("--mc", help="path to MC report JSON "
                                  "(rtp, hit_freq, win_freq, …)")
    ap.add_argument("--juris", action="append",
                    help="path(s) to a jurisdiction lint JSON report; may "
                         "be repeated")
    ap.add_argument("--provenance",
                    help="path to provenance JSON (sha, merkle, sig)")
    ap.add_argument("--out", required=True,
                    help="output XML path")
    ap.add_argument("--validate", action="store_true",
                    help="parse the emitted XML back + sanity-check shape")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    ir_path = Path(args.ir)
    if not ir_path.is_file():
        print(f"error: IR {ir_path} not found", file=sys.stderr)
        return 2
    ir = json.loads(ir_path.read_text())

    mc = None
    if args.mc:
        mc_path = Path(args.mc)
        if not mc_path.is_file():
            print(f"error: MC {mc_path} not found", file=sys.stderr)
            return 2
        mc = json.loads(mc_path.read_text())

    juris: list[dict[str, Any]] = []
    for j in args.juris or []:
        jp = Path(j)
        if not jp.is_file():
            print(f"error: jurisdiction report {jp} not found", file=sys.stderr)
            return 2
        data = json.loads(jp.read_text())
        # Accept single-report shape or {reports:[…]}
        if isinstance(data, dict) and "reports" in data:
            juris.extend(data["reports"])
        elif isinstance(data, list):
            juris.extend(data)
        else:
            juris.append(data)

    provenance = None
    if args.provenance:
        pp = Path(args.provenance)
        if not pp.is_file():
            print(f"error: provenance {pp} not found", file=sys.stderr)
            return 2
        provenance = json.loads(pp.read_text())

    out = emit_cert_xml(
        ir,
        Path(args.out),
        mc_report=mc,
        jurisdiction_reports=juris,
        provenance=provenance,
    )
    if not args.quiet:
        print(f"wrote {out}")

    if args.validate:
        result = validate_cert_xml(out)
        if not args.quiet:
            print(f"validate: passed={result['passed']}")
            for s in result["sections_found"]:
                print(f"  ✓ {s}")
            for i in result["issues"]:
                print(f"  ✗ {i}", file=sys.stderr)
        if not result["passed"]:
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
