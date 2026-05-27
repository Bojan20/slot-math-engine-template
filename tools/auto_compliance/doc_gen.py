"""PHASE 36 — Auto-Compliance Doc Generator kernel."""

from __future__ import annotations

from dataclasses import dataclass, field


SUPPORTED_JURISDICTIONS = (
    "UKGC",
    "MGA",
    "GLI-19",
    "eCOGRA",
    "EU-GA-2024",
)


@dataclass
class ComplianceInputs:
    game_id: str
    swid: str
    target_rtp: float
    measured_rtp: float
    volatility_label: str
    max_win_x: int
    jurisdiction: str
    theorem_cert_hashes: list[str] = field(default_factory=list)
    risk_engine_summary: dict = field(default_factory=dict)
    drift_state_summary: str = "no_drift_detected"


def _ukgc_rules(inp: ComplianceInputs) -> list[tuple[str, str, str]]:
    rules = [
        ("UKGC RTS 7.4 §a", "Volatility band published",
         f"label = {inp.volatility_label}"),
        ("UKGC RTS 7.4 §b", "Risk-engine intervention ladder active",
         f"score policy = {inp.risk_engine_summary.get('policy', 'ukgc_default')}"),
        ("UKGC RTS-12 §a", "Per-rank tournament prize table",
         "see W204 audit doc"),
        ("UKGC RTS-12 §b", "Combined RTP disclosed",
         f"combined = {inp.measured_rtp:.4f}"),
        ("UKGC RTS-14", "Theorem-prover machine-checkable bounds",
         f"{len(inp.theorem_cert_hashes)} certs attached"),
    ]
    return rules


def _mga_rules(inp: ComplianceInputs) -> list[tuple[str, str, str]]:
    return [
        ("MGA PPD §11.1", "Typical-skill expected return",
         f"= measured_rtp = {inp.measured_rtp:.4f}"),
        ("MGA PPD §11.6", "Bonus-tournament hybrid disclosure",
         "see W205 audit doc"),
        ("MGA PPD §11.7", "Drift state",
         inp.drift_state_summary),
    ]


def _gli19_rules(inp: ComplianceInputs) -> list[tuple[str, str, str]]:
    return [
        ("GLI-19 §2.1", "RTP target locked",
         f"target = {inp.target_rtp:.4f}"),
        ("GLI-19 §2.2", "Max-win cap",
         f"≤ {inp.max_win_x}×"),
        ("GLI-19 §3", "PAR Merkle commit",
         "see W7.5 provenance artefact"),
    ]


def _ecogra_rules(inp: ComplianceInputs) -> list[tuple[str, str, str]]:
    return [
        ("eCOGRA §4.1.3", "Pool payout share disclosed",
         "100% paid to participants"),
        ("eCOGRA §4.2", "Cert XML attestation",
         "see cert XML v3 artefact"),
    ]


def _eu_ga_rules(inp: ComplianceInputs) -> list[tuple[str, str, str]]:
    band_ok = inp.measured_rtp >= 0.85
    return [
        ("EU GA 2024 Art. 7", "Combined RTP ≥ 0.85 baseline",
         f"measured {inp.measured_rtp:.4f} → {'PASS' if band_ok else 'WARN'}"),
        ("EU GA 2024 Art. 9", "Cross-jurisdiction harmonisation",
         "see jurisdiction profile YAML"),
    ]


_RULE_PACKS = {
    "UKGC": _ukgc_rules,
    "MGA": _mga_rules,
    "GLI-19": _gli19_rules,
    "eCOGRA": _ecogra_rules,
    "EU-GA-2024": _eu_ga_rules,
}


def emit_compliance_doc(inputs: ComplianceInputs) -> str:
    """Emit a regulator-deliverable markdown report."""
    if inputs.jurisdiction not in _RULE_PACKS:
        raise ValueError(
            f"unsupported jurisdiction: {inputs.jurisdiction!r}; "
            f"valid: {SUPPORTED_JURISDICTIONS}"
        )
    rules = _RULE_PACKS[inputs.jurisdiction](inputs)
    out: list[str] = []
    out.append(f"# Compliance Disclosure — {inputs.jurisdiction}")
    out.append("")
    out.append(f"> Game: `{inputs.game_id}` · SWID: `{inputs.swid}`")
    out.append(f"> Schema: `urn:slotmath:auto-compliance:v1`")
    out.append("")
    out.append("## Summary")
    out.append("")
    out.append(f"- Target RTP: **{inputs.target_rtp:.4f}**")
    out.append(f"- Measured RTP: **{inputs.measured_rtp:.4f}**")
    out.append(f"- Volatility: **{inputs.volatility_label}**")
    out.append(f"- Max-win cap: **{inputs.max_win_x}×**")
    out.append("")
    out.append("## Per-rule disclosure")
    out.append("")
    out.append("| Rule | Description | Evidence |")
    out.append("|---|---|---|")
    for rule, desc, ev in rules:
        out.append(f"| {rule} | {desc} | {ev} |")
    out.append("")
    if inputs.theorem_cert_hashes:
        out.append("## Theorem-prover certificate hashes")
        out.append("")
        for h in inputs.theorem_cert_hashes:
            out.append(f"- `{h}`")
        out.append("")
    return "\n".join(out)
