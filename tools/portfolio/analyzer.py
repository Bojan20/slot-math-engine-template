"""Multi-IR portfolio analyzer — per-IR metrics + matrix aggregator.

Per-IR metrics:
  • rtp_estimate          — Bernoulli per-line approximation
  • hit_freq_estimate     — fraction of paying lines × per-spin lines
  • paytable_depth        — number of paytable rows
  • reel_diversity        — Shannon entropy normalized [0, 1] of the
                            symbol distribution across base reels
                            (higher = more diverse strips)
  • feature_kinds         — sorted list of feature kinds present
  • topology              — (reels, rows, kind)
  • volatility_proxy      — sqrt(Σ p_i × pay_i²) — second-moment
                            estimate of per-line variance

The portfolio aggregator computes:
  • RTP / volatility scatter (Pareto frontier)
  • Feature × IR presence heatmap
  • Topology distribution (kind counts, reel counts)
"""
from __future__ import annotations
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from tools.drift_sentinel.scanner import (
    _extract_reels,
    _extract_paytable,
    _normalize_features,
)


# ─── per-IR metrics ────────────────────────────────────────────────


@dataclass
class IRMetrics:
    rel_path: str
    name: str
    vendor: str
    swid: str
    topology_kind: str
    reels: int
    rows: Any
    paytable_depth: int
    feature_kinds: list[str]
    rtp_estimate: float | None
    hit_freq_estimate: float | None
    reel_diversity: float | None
    volatility_proxy: float | None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "rel_path": self.rel_path,
            "name": self.name,
            "vendor": self.vendor,
            "swid": self.swid,
            "topology_kind": self.topology_kind,
            "reels": self.reels,
            "rows": self.rows,
            "paytable_depth": self.paytable_depth,
            "feature_kinds": list(self.feature_kinds),
            "rtp_estimate": self.rtp_estimate,
            "hit_freq_estimate": self.hit_freq_estimate,
            "reel_diversity": self.reel_diversity,
            "volatility_proxy": self.volatility_proxy,
            "error": self.error,
        }


# ─── per-reel helpers ──────────────────────────────────────────────


def _per_reel_freq(reels: list[list[str]]) -> list[dict[str, float]]:
    out: list[dict[str, float]] = []
    for reel in reels:
        if not reel:
            out.append({})
            continue
        c: dict[str, int] = {}
        for cell in reel:
            c[cell] = c.get(cell, 0) + 1
        n = len(reel)
        out.append({k: v / n for k, v in c.items()})
    return out


def _reel_diversity(reels: list[list[str]]) -> float | None:
    """Normalized Shannon entropy of the symbol distribution across all
    visible cells of the base strips. 0 = single symbol, 1 = uniform
    across all distinct symbols."""
    if not reels or not any(reels):
        return None
    counts: dict[str, int] = {}
    n = 0
    for reel in reels:
        for cell in reel:
            counts[cell] = counts.get(cell, 0) + 1
            n += 1
    if n == 0:
        return None
    if len(counts) <= 1:
        return 0.0
    entropy = 0.0
    for c in counts.values():
        p = c / n
        if p > 0:
            entropy -= p * math.log2(p)
    return entropy / math.log2(len(counts))


def _bernoulli_rtp_and_hit(ir: dict[str, Any]) -> tuple[float | None,
                                                          float | None,
                                                          float | None]:
    """Return (rtp_estimate, hit_freq_estimate, volatility_proxy).
    Each component is None when the IR lacks the required data."""
    reels = _extract_reels(ir)
    if not reels or not any(reels):
        return None, None, None
    p_per_reel = _per_reel_freq(reels)
    pt = _extract_paytable(ir)
    if not pt:
        return None, None, None

    rtp = 0.0
    hit = 0.0
    second_moment = 0.0
    for combo_t, pay, _cs in pt:
        if pay <= 0 or not combo_t:
            continue
        first_sym = combo_t[0]
        if not first_sym or first_sym in ("--", "-", ""):
            continue
        run = 0
        for x in combo_t:
            if x == first_sym:
                run += 1
            else:
                break
        if run < 3:
            continue
        prob = 1.0
        for r_idx in range(run):
            if r_idx >= len(p_per_reel):
                prob = 0.0
                break
            prob *= p_per_reel[r_idx].get(first_sym, 0.0)
        if prob > 0:
            rtp += prob * pay
            hit += prob
            second_moment += prob * (pay ** 2)
    # variance ≈ E[X²] − E[X]² (E[X] is per-line; we keep proxy as
    # sqrt of E[X²] which scales with absolute pay magnitudes)
    vol = math.sqrt(second_moment) if second_moment > 0 else None
    return rtp, hit, vol


# ─── metrics_for_ir ────────────────────────────────────────────────


def metrics_for_ir(ir: dict[str, Any], *, rel_path: str = "") -> IRMetrics:
    """Compute every IRMetrics field for a parsed IR dict."""
    meta = ir.get("meta") or {}
    topo = ir.get("topology") or {}
    rtp, hit, vol = _bernoulli_rtp_and_hit(ir)
    reels = _extract_reels(ir)
    return IRMetrics(
        rel_path=rel_path,
        name=str(meta.get("name") or meta.get("id") or rel_path or "game"),
        vendor=str(meta.get("vendor") or "unknown"),
        swid=str(meta.get("swid") or ""),
        topology_kind=str(topo.get("kind") or "rectangular"),
        reels=int(topo.get("reels") or 0),
        rows=topo.get("rows"),
        paytable_depth=len(_extract_paytable(ir)),
        feature_kinds=_normalize_features(ir.get("features")),
        rtp_estimate=rtp,
        hit_freq_estimate=hit,
        reel_diversity=_reel_diversity(reels),
        volatility_proxy=vol,
    )


# ─── PortfolioReport ────────────────────────────────────────────────


@dataclass
class PortfolioReport:
    metrics: list[IRMetrics] = field(default_factory=list)
    games_root: str = ""

    # ─── aggregates ────────────────────────────────────────────────

    @property
    def total_irs(self) -> int:
        return len(self.metrics)

    @property
    def vendor_counts(self) -> dict[str, int]:
        c: dict[str, int] = {}
        for m in self.metrics:
            c[m.vendor] = c.get(m.vendor, 0) + 1
        return c

    @property
    def topology_counts(self) -> dict[str, int]:
        c: dict[str, int] = {}
        for m in self.metrics:
            c[m.topology_kind] = c.get(m.topology_kind, 0) + 1
        return c

    @property
    def feature_counts(self) -> dict[str, int]:
        c: dict[str, int] = {}
        for m in self.metrics:
            for f in m.feature_kinds:
                c[f] = c.get(f, 0) + 1
        return c

    def pareto_frontier(self) -> list[IRMetrics]:
        """Return the Pareto-optimal subset on (rtp ↑, volatility ↓).

        A metric dominates another iff rtp ≥ AND volatility ≤ (one
        strict). Used by the HTML scatter chart to mark frontier
        points in a distinct color.
        """
        pts = [m for m in self.metrics
               if m.rtp_estimate is not None and m.volatility_proxy is not None]
        front: list[IRMetrics] = []
        for a in pts:
            dominated = False
            for b in pts:
                if a is b:
                    continue
                if (b.rtp_estimate >= a.rtp_estimate
                        and b.volatility_proxy <= a.volatility_proxy
                        and (b.rtp_estimate > a.rtp_estimate
                             or b.volatility_proxy < a.volatility_proxy)):
                    dominated = True
                    break
            if not dominated:
                front.append(a)
        return front

    # ─── serialization ─────────────────────────────────────────────

    def to_dict(self) -> dict[str, Any]:
        return {
            "games_root": self.games_root,
            "total_irs": self.total_irs,
            "vendor_counts": self.vendor_counts,
            "topology_counts": self.topology_counts,
            "feature_counts": self.feature_counts,
            "pareto_frontier": [m.rel_path for m in self.pareto_frontier()],
            "metrics": [m.to_dict() for m in self.metrics],
        }

    def to_markdown(self) -> str:
        lines: list[str] = []
        lines.append("# Portfolio Analyzer Report")
        lines.append("")
        lines.append(f"- games root: `{self.games_root}`")
        lines.append(f"- total IRs: {self.total_irs}")
        lines.append("")
        lines.append("## Topology mix")
        for k, v in sorted(self.topology_counts.items()):
            lines.append(f"- {k}: {v}")
        lines.append("")
        lines.append("## Vendor mix")
        for k, v in sorted(self.vendor_counts.items()):
            lines.append(f"- {k}: {v}")
        lines.append("")
        lines.append("## Feature catalog coverage")
        for k, v in sorted(self.feature_counts.items(),
                            key=lambda kv: (-kv[1], kv[0])):
            lines.append(f"- {k}: {v}")
        lines.append("")
        lines.append("## Per-IR metrics")
        lines.append("")
        lines.append("| IR | vendor | topology | reels×rows | RTP est | "
                      "hit | vol | diversity | paytable | features |")
        lines.append("|---|---|---|---|---|---|---|---|---|---|")
        front = {m.rel_path for m in self.pareto_frontier()}
        for m in self.metrics:
            tag = " ★" if m.rel_path in front else ""
            r = "—" if m.rtp_estimate is None else f"{m.rtp_estimate:.4f}"
            h = "—" if m.hit_freq_estimate is None else f"{m.hit_freq_estimate:.4f}"
            v = "—" if m.volatility_proxy is None else f"{m.volatility_proxy:.2f}"
            d = "—" if m.reel_diversity is None else f"{m.reel_diversity:.3f}"
            lines.append(
                f"| `{m.rel_path}`{tag} | {m.vendor} | {m.topology_kind} "
                f"| {m.reels}×{m.rows} | {r} | {h} | {v} | {d} "
                f"| {m.paytable_depth} | {', '.join(m.feature_kinds) or '—'} |"
            )
        if front:
            lines.append("")
            lines.append("★ = Pareto-optimal on (RTP↑, volatility↓)")
        return "\n".join(lines) + "\n"

    def to_html(self) -> str:
        front_set = {m.rel_path for m in self.pareto_frontier()}
        pts = []
        for m in self.metrics:
            if m.rtp_estimate is None or m.volatility_proxy is None:
                continue
            pts.append({
                "name": m.name,
                "rel": m.rel_path,
                "rtp": m.rtp_estimate,
                "vol": m.volatility_proxy,
                "front": m.rel_path in front_set,
            })
        pts_json = json.dumps(pts)
        rows = []
        for m in self.metrics:
            star = "★" if m.rel_path in front_set else ""
            rtp = "" if m.rtp_estimate is None else f"{m.rtp_estimate:.4f}"
            vol = "" if m.volatility_proxy is None else f"{m.volatility_proxy:.2f}"
            div = "" if m.reel_diversity is None else f"{m.reel_diversity:.3f}"
            feats = ", ".join(m.feature_kinds) or "—"
            rows.append(
                f"<tr><td>{star} <code>{m.rel_path}</code></td>"
                f"<td>{m.vendor}</td><td>{m.topology_kind}</td>"
                f"<td>{rtp}</td><td>{vol}</td><td>{div}</td>"
                f"<td>{m.paytable_depth}</td><td>{feats}</td></tr>"
            )
        rows_html = "\n".join(rows)
        return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Portfolio Analyzer</title>
<style>
  body {{ font: 14px/1.4 system-ui, -apple-system, sans-serif;
         margin: 24px; color: #222; }}
  h1 {{ font-size: 20px; margin: 0 0 8px; }}
  .meta {{ color: #666; margin-bottom: 16px; }}
  table {{ border-collapse: collapse; width: 100%; margin-top: 16px; }}
  th, td {{ text-align: left; padding: 6px 10px;
            border-bottom: 1px solid #eee; }}
  th {{ background: #fafafa; }}
  code {{ background: #f0f0f0; padding: 1px 4px; border-radius: 3px; }}
  svg {{ border: 1px solid #eee; background: #fbfbfb; }}
  .legend {{ font-size: 12px; color: #666; }}
</style></head><body>
<h1>Portfolio Analyzer</h1>
<div class=meta>games root: <code>{self.games_root}</code> ·
  total IRs: <b>{self.total_irs}</b> ·
  pareto frontier: <b>{len(front_set)}</b></div>

<h2>Pareto scatter (RTP ↑ × volatility ↓)</h2>
<svg id="scatter" width="640" height="320"></svg>
<div class=legend>Filled dots = Pareto-optimal subset.</div>

<h2>Per-IR metrics</h2>
<table><thead><tr>
<th>IR</th><th>vendor</th><th>topology</th>
<th>RTP est</th><th>vol</th><th>diversity</th>
<th>paytable</th><th>features</th>
</tr></thead><tbody>
{rows_html}
</tbody></table>

<script>
const pts = {pts_json};
const svg = document.getElementById('scatter');
if (pts.length > 0) {{
  const w = 640, h = 320, pad = 40;
  const xs = pts.map(p => p.vol), ys = pts.map(p => p.rtp);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys);
  const xRange = (xmax - xmin) || 1;
  const yRange = (ymax - ymin) || 1;
  const sx = v => pad + (v - xmin) / xRange * (w - 2 * pad);
  const sy = v => h - pad - (v - ymin) / yRange * (h - 2 * pad);
  // axes
  const axisX = `M${{pad}} ${{h - pad}} L ${{w - pad}} ${{h - pad}}`;
  const axisY = `M${{pad}} ${{pad}} L ${{pad}} ${{h - pad}}`;
  svg.innerHTML = `<path d="${{axisX}} ${{axisY}}"
                       fill="none" stroke="#888"/>
    <text x="${{w/2}}" y="${{h - 8}}" text-anchor="middle"
          font-size="12" fill="#666">volatility →</text>
    <text x="14" y="${{h/2}}" text-anchor="middle"
          font-size="12" fill="#666"
          transform="rotate(-90 14 ${{h/2}})">RTP →</text>
    ${{pts.map(p =>
      `<circle cx="${{sx(p.vol)}}" cy="${{sy(p.rtp)}}" r="5" ` +
      `fill="${{p.front ? '#1f7a1f' : 'none'}}" ` +
      `stroke="${{p.front ? '#1f7a1f' : '#888'}}" stroke-width="1.5">` +
      `<title>${{p.name}} (RTP ${{p.rtp.toFixed(4)}} · vol ${{p.vol.toFixed(2)}})</title>` +
      `</circle>`).join('')}}`;
}} else {{
  svg.innerHTML = '<text x="320" y="160" text-anchor="middle"' +
    ' fill="#999">no IR has both RTP + volatility</text>';
}}
</script>
</body></html>
"""


# ─── discovery + driver ────────────────────────────────────────────


DEFAULT_GLOBS = ("**/*.ir.json", "**/ir.json", "**/universal_ir.json")


def _discover_irs(games_root: Path, globs: Iterable[str]) -> list[Path]:
    seen: set[Path] = set()
    out: list[Path] = []
    for pat in globs:
        for p in sorted(games_root.glob(pat)):
            if p.is_file() and p not in seen:
                seen.add(p)
                out.append(p)
    return out


def analyze_portfolio(
    games_root: Path,
    *,
    globs: Iterable[str] | None = None,
    explicit_paths: list[Path] | None = None,
) -> PortfolioReport:
    """Analyze every IR under `games_root` (or `explicit_paths`)."""
    games_root = Path(games_root)
    paths = (list(explicit_paths) if explicit_paths
             else _discover_irs(games_root,
                                 list(globs) if globs else DEFAULT_GLOBS))
    metrics: list[IRMetrics] = []
    for p in paths:
        try:
            rel = (str(p.relative_to(games_root))
                   if explicit_paths is None else str(p))
        except ValueError:
            rel = str(p)
        try:
            ir = json.loads(p.read_text())
        except Exception as e:  # noqa: BLE001
            metrics.append(IRMetrics(
                rel_path=rel,
                name=p.name,
                vendor="unknown",
                swid="",
                topology_kind="?",
                reels=0,
                rows=None,
                paytable_depth=0,
                feature_kinds=[],
                rtp_estimate=None,
                hit_freq_estimate=None,
                reel_diversity=None,
                volatility_proxy=None,
                error=str(e),
            ))
            continue
        metrics.append(metrics_for_ir(ir, rel_path=rel))
    return PortfolioReport(metrics=metrics, games_root=str(games_root))
