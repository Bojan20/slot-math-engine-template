"""Pilot outreach package builder (W76 / P7.4)."""
from __future__ import annotations
import csv
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from string import Template
from typing import Any


_COVER_LETTER = Template(
    """# Slot Math Engine — Pilot Proposal

**To:** $operator_name
**From:** Slot Math Engine team
**Date:** $today
**Subject:** Pilot deployment of `$game_title` ($swid)

---

Dear $operator_contact,

We are reaching out to propose a pilot deployment of the
**$game_title** slot game template under a $tier engagement.

Highlights:

- **Target RTP**: $target_rtp · estimated MC RTP within ±0.5 % of target
- **Volatility class**: $volatility
- **Features**: $features
- **Jurisdiction coverage**: $jurisdictions
- **Cert artifacts**: cert.zip (signed), cert.xml v2, SBOM CycloneDX 1.4,
  sign-off PDF, ed25519 pubkey bundle
- **Time-to-launch**: $time_to_launch

This package is **regulator-ready**: GLI-16-shape XML, ed25519-signed
provenance, RFC-6962 Merkle PAR commitment, and a reproducible build
manifest. Every artifact is independently verifiable via
`slot-cert-e2e-verify`.

Commercial terms: $commercial_terms

We would welcome a short call to walk through the artifacts and
discuss next steps.

Best regards,

Slot Math Engine team
"""
)


_TECH_BRIEF = Template(
    """# Technical Brief — $game_title

## Game spec

- **Template ID**: `$template_id`
- **SWID**: `$swid`
- **Vendor profile**: $vendor
- **Topology**: $topology, $paylines paylines
- **Target RTP**: $target_rtp
- **Volatility class**: $volatility
- **Features**: $features

## Math + cert chain

- **Closed-form RTP solvers**: 100 / 100 (analytical ground truth)
- **MC validation**: 10⁹ spins / 60 s on M2 Max
- **Cert XML**: v2 namespace (urn:slotmath:cert:v2), per-jurisdiction
  provenance branches with ed25519 transition signatures
- **Provenance**: RFC-6962 binary Merkle commit over PAR rows
- **SBOM**: CycloneDX 1.4 — every Python tool module + entry point hashed

## Compliance gates that ran during build

- W11 Drift Sentinel — IR fingerprint vs baseline
- W14 CI Gate Aggregator — drift + cert XML + jurisdiction + matrix
- W56 Cert XML Verifier — namespace + IR digest + signature batch verify
- W58 IR Diff Gate — rule-driven pre-merge guard
- W71 Cert Bundle E2E Verifier — chained final verdict
- W74 Master Pipeline Gate — repo-wide single-command CI gate

## Pricing

$pricing_block

## Next steps

1. Sign NDA + technical review session (~60 min)
2. Pilot deployment in a staging RGS for $pilot_duration
3. Production launch with co-marketing
"""
)


@dataclass
class OutreachConfig:
    operator_name: str
    operator_contact: str = "Slot Operations Team"
    game_title: str = ""
    template_id: str = ""
    swid: str = ""
    vendor: str = ""
    topology: str = ""
    paylines: int = 0
    target_rtp: float | None = None
    volatility: str = "medium"
    features: list[str] = field(default_factory=list)
    jurisdictions: list[str] = field(default_factory=list)
    tier: str = "BASIC"
    price_eur: int = 999
    time_to_launch: str = "30 days post sign-off"
    commercial_terms: str = "Net-30 invoicing. Yearly licensing in EUR."
    pilot_duration: str = "30 days"


@dataclass
class OutreachPackage:
    out_dir: Path
    cover_letter: Path
    tech_brief: Path
    pricing_csv: Path
    bundle_zip: Path

    def to_dict(self) -> dict[str, Any]:
        return {
            "out_dir": str(self.out_dir),
            "cover_letter": str(self.cover_letter),
            "tech_brief": str(self.tech_brief),
            "pricing_csv": str(self.pricing_csv),
            "bundle_zip": str(self.bundle_zip),
        }


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def build_outreach_package(
    out_dir: Path,
    config: OutreachConfig,
    *,
    attachments: list[Path] | None = None,
) -> OutreachPackage:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    rtp_str = (
        f"{config.target_rtp:.2%}"
        if config.target_rtp is not None else "—"
    )
    feats_str = ", ".join(config.features) or "—"
    juris_str = ", ".join(config.jurisdictions) or "(none on file)"
    pricing_block = (
        f"- **{config.tier}** tier: €{config.price_eur:,} / year per "
        f"operator deployment\n"
        f"- Includes: math engine + cert ZIP + jurisdiction lint + "
        f"telemetry hook\n"
        f"- Excludes: art assets, integration with operator's wallet"
    )

    cover = out_dir / "cover_letter.md"
    cover.write_text(_COVER_LETTER.substitute(
        operator_name=config.operator_name,
        operator_contact=config.operator_contact,
        game_title=config.game_title or config.template_id,
        swid=config.swid or "—",
        tier=config.tier,
        target_rtp=rtp_str,
        volatility=config.volatility,
        features=feats_str,
        jurisdictions=juris_str,
        time_to_launch=config.time_to_launch,
        commercial_terms=config.commercial_terms,
        today=_today(),
    ))

    brief = out_dir / "tech_brief.md"
    brief.write_text(_TECH_BRIEF.substitute(
        game_title=config.game_title or config.template_id,
        template_id=config.template_id,
        swid=config.swid or "—",
        vendor=config.vendor or "—",
        topology=config.topology or "—",
        paylines=config.paylines or 0,
        target_rtp=rtp_str,
        volatility=config.volatility,
        features=feats_str,
        pricing_block=pricing_block,
        pilot_duration=config.pilot_duration,
    ))

    pricing_csv = out_dir / "pricing.csv"
    with pricing_csv.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["template_id", "tier", "price_eur_year", "swid"])
        w.writerow([
            config.template_id, config.tier,
            config.price_eur, config.swid,
        ])

    # Bundle every output (+ optional attachments) into a ZIP
    bundle_zip = out_dir / "outreach-kit.zip"
    with zipfile.ZipFile(bundle_zip, "w",
                          compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(cover, arcname="cover_letter.md")
        zf.write(brief, arcname="tech_brief.md")
        zf.write(pricing_csv, arcname="pricing.csv")
        for att in attachments or []:
            att = Path(att)
            if att.exists():
                zf.write(att, arcname=f"attachments/{att.name}")

    return OutreachPackage(
        out_dir=out_dir,
        cover_letter=cover,
        tech_brief=brief,
        pricing_csv=pricing_csv,
        bundle_zip=bundle_zip,
    )
