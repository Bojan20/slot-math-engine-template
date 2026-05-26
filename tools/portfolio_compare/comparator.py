"""Portfolio comparator — multi-IR side-by-side summary."""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class GameSummary:
    game_id: str
    vendor: str
    swid: str
    target_rtp: float | None
    volatility: str | None
    paytable_rows: int
    feature_kinds: list[str] = field(default_factory=list)
    topology: str | None = None
    reels: int | None = None
    rows: int | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "game_id": self.game_id,
            "vendor": self.vendor,
            "swid": self.swid,
            "target_rtp": self.target_rtp,
            "volatility": self.volatility,
            "paytable_rows": self.paytable_rows,
            "feature_kinds": list(self.feature_kinds),
            "topology": self.topology,
            "reels": self.reels,
            "rows": self.rows,
        }


@dataclass
class PortfolioReport:
    games: list[GameSummary] = field(default_factory=list)

    @property
    def n_games(self) -> int:
        return len(self.games)

    @property
    def vendor_breakdown(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for g in self.games:
            counts[g.vendor] = counts.get(g.vendor, 0) + 1
        return counts

    @property
    def rtp_range(self) -> tuple[float, float] | None:
        vals = [g.target_rtp for g in self.games if g.target_rtp is not None]
        if not vals:
            return None
        return (min(vals), max(vals))

    @property
    def feature_universe(self) -> list[str]:
        seen: set[str] = set()
        for g in self.games:
            for k in g.feature_kinds:
                seen.add(k)
        return sorted(seen)

    def to_dict(self) -> dict[str, Any]:
        return {
            "n_games": self.n_games,
            "vendor_breakdown": self.vendor_breakdown,
            "rtp_range": list(self.rtp_range) if self.rtp_range else None,
            "feature_universe": self.feature_universe,
            "games": [g.to_dict() for g in self.games],
        }


def summarize_ir(ir: dict[str, Any]) -> GameSummary:
    meta = ir.get("meta") or {}
    target = meta.get("target_rtp")
    if isinstance(target, (int, float)) and target > 1.5:
        target = target / 100.0
    topo = ir.get("topology") or {}
    features = ir.get("features") or []
    feature_kinds = [
        str(f.get("kind", "")) for f in features
        if isinstance(f, dict) and f.get("kind")
    ]
    return GameSummary(
        game_id=str(meta.get("id", "unknown")),
        vendor=str(meta.get("vendor", "unknown")),
        swid=str(meta.get("swid", "unknown")),
        target_rtp=float(target) if isinstance(target, (int, float)) else None,
        volatility=str(meta["volatility"]) if "volatility" in meta else None,
        paytable_rows=len(ir.get("paytable") or []),
        feature_kinds=feature_kinds,
        topology=topo.get("kind"),
        reels=topo.get("reels"),
        rows=topo.get("rows"),
    )


def compare(irs: list[dict[str, Any]]) -> PortfolioReport:
    return PortfolioReport(games=[summarize_ir(ir) for ir in irs])


def render_markdown(report: PortfolioReport) -> str:
    lines = [
        "# Portfolio Comparator",
        "",
        f"- games: **{report.n_games}**",
        f"- vendors: {report.vendor_breakdown}",
    ]
    if report.rtp_range:
        lines.append(f"- RTP range: {report.rtp_range[0]:.4f} – {report.rtp_range[1]:.4f}")
    if report.feature_universe:
        lines.append(f"- feature universe: {report.feature_universe}")
    lines.extend([
        "",
        "| Game | Vendor | SWID | RTP | Vol | Paytable | Features | Topology |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ])
    for g in report.games:
        rtp_repr = f"{g.target_rtp:.4f}" if g.target_rtp is not None else "—"
        vol_repr = g.volatility or "—"
        topo_repr = (
            f"{g.topology} {g.reels}×{g.rows}"
            if (g.topology and g.reels and g.rows)
            else (g.topology or "—")
        )
        feat = ",".join(g.feature_kinds) if g.feature_kinds else "—"
        lines.append(
            f"| `{g.game_id}` | {g.vendor} | {g.swid} | {rtp_repr} | "
            f"{vol_repr} | {g.paytable_rows} | {feat} | {topo_repr} |"
        )
    return "\n".join(lines) + "\n"
