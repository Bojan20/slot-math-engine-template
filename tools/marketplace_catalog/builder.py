"""Marketplace catalog builder (W75 / P7.1)."""
from __future__ import annotations
import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from pathlib import Path
from typing import Any

from tools.drift_sentinel.scanner import (
    bernoulli_rtp_estimate,
    _normalize_features,
)


class PricingTier(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PREMIUM = "premium"


_TIER_PRICE_EUR = {
    PricingTier.FREE: 0,
    PricingTier.BASIC: 999,
    PricingTier.PREMIUM: 4999,
}


_VOLATILITY_BANDS = (
    ("low",    (0.0, 8.0)),
    ("medium", (8.0, 16.0)),
    ("high",   (16.0, 32.0)),
    ("ultra",  (32.0, float("inf"))),
)


@dataclass
class TemplateCard:
    template_id: str
    title: str
    vendor: str
    swid: str
    target_rtp: float | None
    rtp_estimate: float | None
    volatility_class: str
    feature_kinds: list[str] = field(default_factory=list)
    topology: str = ""
    paylines: int = 0
    pricing_tier: str = PricingTier.FREE.value
    price_eur: int = 0
    demo_url: str = ""
    cover_image: str = ""
    blurb: str = ""
    ir_rel_path: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class MarketplaceCatalog:
    repo: str
    generated_at_utc: str
    cards: list[TemplateCard] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "repo": self.repo,
            "generated_at_utc": self.generated_at_utc,
            "cards": [c.to_dict() for c in self.cards],
            "counts": dict(self.counts),
            "total_cards": len(self.cards),
        }


# ─── helpers ───────────────────────────────────────────────────────


def _classify_pricing(
    feature_count: int,
    jurisdiction_count: int,
) -> PricingTier:
    if feature_count <= 1 and jurisdiction_count <= 0:
        return PricingTier.FREE
    if feature_count >= 4 or jurisdiction_count >= 2:
        return PricingTier.PREMIUM
    return PricingTier.BASIC


def _volatility_class(proxy: float | None) -> str:
    if proxy is None:
        return "unknown"
    try:
        v = float(proxy)
    except (TypeError, ValueError):
        return "unknown"
    for label, (lo, hi) in _VOLATILITY_BANDS:
        if lo <= v < hi:
            return label
    return "ultra"


def _volatility_proxy(ir: dict[str, Any]) -> float:
    """Very rough sqrt(Σ pay²) without per-symbol probabilities — only
    used to bucket games into bands for marketing copy. Real volatility
    classification lives in `tools.volatility_classifier`."""
    pt = ir.get("paytable") or []
    total = 0.0
    for row in pt:
        if not isinstance(row, dict):
            continue
        try:
            pay = float(row.get("pays") or row.get("pay") or 0)
        except (TypeError, ValueError):
            pay = 0.0
        total += pay * pay
    import math
    return math.sqrt(total / max(len(pt), 1))


def _blurb(card: TemplateCard) -> str:
    parts = [
        f"{card.title} is a {card.volatility_class}-volatility slot "
        f"template",
    ]
    if card.target_rtp is not None:
        parts.append(f"with a target RTP of {card.target_rtp:.2%}")
    if card.feature_kinds:
        feats = ", ".join(card.feature_kinds)
        parts.append(f"featuring {feats}")
    if card.paylines:
        parts.append(f"on {card.paylines} paylines")
    return " ".join(parts).strip() + "."


# ─── public API ────────────────────────────────────────────────────


def build_catalog(
    games_root: Path,
    *,
    demo_base_url: str = "",
    cover_dir: str = "covers/",
) -> MarketplaceCatalog:
    games_root = Path(games_root)
    catalog = MarketplaceCatalog(
        repo=str(games_root),
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
    )
    if not games_root.exists():
        return catalog

    counts = {"free": 0, "basic": 0, "premium": 0, "total": 0}

    seen: set[Path] = set()
    for pat in ("*.ir.json", "ir.json", "universal_ir.json"):
        for p in sorted(games_root.rglob(pat)):
            if p in seen:
                continue
            seen.add(p)
            try:
                ir = json.loads(p.read_text())
            except (FileNotFoundError, json.JSONDecodeError):
                continue
            if not isinstance(ir, dict):
                continue
            meta = ir.get("meta") or {}
            template_id = str(
                meta.get("id") or p.stem.replace(".ir", "")
            )
            title = str(meta.get("name") or template_id.replace("-", " ").title())
            vendor = str(meta.get("vendor", ""))
            swid = str(meta.get("swid", ""))
            target = meta.get("target_rtp")
            target_rtp = (
                float(target) if isinstance(target, (int, float)) else None
            )

            rtp_est = bernoulli_rtp_estimate(ir)
            feat_kinds = list(_normalize_features(ir.get("features")))
            topology = (ir.get("topology") or {}).get("kind", "")
            paylines = len(
                (ir.get("evaluation") or {}).get("paylines") or []
            ) or (ir.get("topology") or {}).get("paylines", 0)

            jurisdictions = list(meta.get("jurisdictions") or [])
            pricing = _classify_pricing(
                len(feat_kinds), len(jurisdictions)
            )
            vol_class = _volatility_class(_volatility_proxy(ir))

            card = TemplateCard(
                template_id=template_id,
                title=title,
                vendor=vendor,
                swid=swid,
                target_rtp=target_rtp,
                rtp_estimate=float(rtp_est) if rtp_est is not None else None,
                volatility_class=vol_class,
                feature_kinds=feat_kinds,
                topology=str(topology),
                paylines=int(paylines or 0),
                pricing_tier=pricing.value,
                price_eur=_TIER_PRICE_EUR[pricing],
                demo_url=(
                    f"{demo_base_url.rstrip('/')}/{template_id}/"
                    if demo_base_url else ""
                ),
                cover_image=f"{cover_dir.rstrip('/')}/{template_id}.png",
                ir_rel_path=str(p.relative_to(games_root)),
            )
            card.blurb = _blurb(card)
            catalog.cards.append(card)
            counts[pricing.value] += 1
            counts["total"] += 1

    catalog.counts = counts
    return catalog


# ─── emitters ──────────────────────────────────────────────────────


def _emit_markdown(cat: MarketplaceCatalog) -> str:
    lines = [
        "# Slot Math Marketplace",
        "",
        f"_Generated {cat.generated_at_utc}_",
        "",
        "| ID | Title | Vendor | Tier | Price (EUR) | Target RTP | "
        "Vol | Features |",
        "|---|---|---|---|---:|---:|---|---|",
    ]
    for c in cat.cards:
        rtp = f"{c.target_rtp:.2%}" if c.target_rtp is not None else "—"
        feats = ", ".join(c.feature_kinds) or "—"
        lines.append(
            f"| `{c.template_id}` | {c.title} | {c.vendor} | "
            f"**{c.pricing_tier.upper()}** | €{c.price_eur} | {rtp} | "
            f"{c.volatility_class} | {feats} |"
        )
    lines.extend([
        "",
        "## Tier totals",
        "",
        f"- FREE    : {cat.counts.get('free', 0)}",
        f"- BASIC   : {cat.counts.get('basic', 0)}",
        f"- PREMIUM : {cat.counts.get('premium', 0)}",
        f"- **TOTAL** : {cat.counts.get('total', 0)}",
    ])
    return "\n".join(lines) + "\n"


def _emit_card_md(card: TemplateCard) -> str:
    return (
        f"# {card.title}\n\n"
        f"- **Template ID**: `{card.template_id}`\n"
        f"- **Vendor**: {card.vendor or '—'}\n"
        f"- **SWID**: `{card.swid or '—'}`\n"
        f"- **Pricing tier**: **{card.pricing_tier.upper()}** "
        f"(€{card.price_eur} / year)\n"
        f"- **Target RTP**: "
        f"{card.target_rtp:.2%}\n" if card.target_rtp is not None
        else f"- **Target RTP**: —\n"
        f"- **Volatility**: {card.volatility_class}\n"
        f"- **Topology**: {card.topology or '—'}\n"
        f"- **Paylines**: {card.paylines}\n"
        f"- **Features**: {', '.join(card.feature_kinds) or '—'}\n"
        f"- **Demo**: "
        f"[{card.demo_url}]({card.demo_url})\n" if card.demo_url
        else f"- **Demo**: —\n"
        f"- **Cover**: `{card.cover_image}`\n"
        f"\n## Description\n\n{card.blurb}\n"
    )


def emit_catalog(
    catalog: MarketplaceCatalog,
    out_dir: Path,
) -> dict[str, Path]:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cards_dir = out_dir / "cards"
    cards_dir.mkdir(exist_ok=True)
    json_path = out_dir / "marketplace.json"
    md_path = out_dir / "marketplace.md"
    json_path.write_text(
        json.dumps(catalog.to_dict(), indent=2, sort_keys=True)
    )
    md_path.write_text(_emit_markdown(catalog))
    for c in catalog.cards:
        (cards_dir / f"{c.template_id}.md").write_text(_emit_card_md(c))
    return {
        "json": json_path,
        "md": md_path,
        "cards_dir": cards_dir,
    }
