"""Operator dashboard aggregator (W57).

Pulls signals from existing tools without re-running heavy MC:

  * ``drift_sentinel.scanner.fingerprint`` + ``bernoulli_rtp_estimate``
    → per-IR math fingerprint + RTP estimate (engine-free)
  * ``portfolio.analyzer.IRMetrics``-style metrics → volatility proxy,
    feature kinds, paytable depth, reel diversity

Traffic light rules (per game):
  * RED   — RTP estimate outside target_rtp ±0.01 (when target_rtp set)
  *         OR cert XML missing OR drift fingerprint mismatch
  * YELLOW — RTP estimate within ±0.005..0.01 OR cert ZIP present but
             cert XML missing OR no telemetry pointer in meta
  * GREEN  — all checks pass
"""
from __future__ import annotations
import json
import math
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from tools.drift_sentinel.scanner import (
    bernoulli_rtp_estimate,
    fingerprint,
    _extract_paytable,
    _extract_reels,
    _normalize_features,
)


# ─── per-game summary ──────────────────────────────────────────────


@dataclass
class GameSummary:
    rel_path: str
    name: str = ""
    vendor: str = ""
    swid: str = ""
    target_rtp: float | None = None
    rtp_estimate: float | None = None
    rtp_delta: float | None = None
    rtp_severity: str = "none"      # green | yellow | red | none
    fingerprint: str = ""
    feature_kinds: list[str] = field(default_factory=list)
    paytable_depth: int = 0
    reel_diversity: float = 0.0
    volatility_proxy: float = 0.0
    cert_xml_present: bool = False
    cert_zip_present: bool = False
    telemetry_pointer: bool = False
    traffic_light: str = "green"
    issues: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class DashboardReport:
    games: list[GameSummary] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    generated_at_utc: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "games": [g.to_dict() for g in self.games],
            "counts": dict(self.counts),
            "generated_at_utc": self.generated_at_utc,
        }


# ─── helpers ───────────────────────────────────────────────────────


def _classify_rtp(target: float | None, est: float | None) -> tuple[str, float | None]:
    if target is None or est is None:
        return "none", None
    delta = abs(est - target)
    if delta < 0.005:
        return "green", delta
    if delta < 0.01:
        return "yellow", delta
    return "red", delta


def _shannon_entropy(counts: list[int]) -> float:
    total = sum(counts)
    if total <= 0:
        return 0.0
    probs = [c / total for c in counts if c > 0]
    if not probs:
        return 0.0
    h = -sum(p * math.log2(p) for p in probs)
    norm = math.log2(len(probs)) if len(probs) > 1 else 1.0
    return min(1.0, h / norm) if norm > 0 else 0.0


def _reel_diversity(ir: dict[str, Any]) -> float:
    reels = _extract_reels(ir)
    counts: dict[str, int] = {}
    for strip in reels or []:
        for s in strip:
            counts[s] = counts.get(s, 0) + 1
    return _shannon_entropy(list(counts.values()))


def _volatility_proxy(ir: dict[str, Any]) -> float:
    """sqrt(Σ p_i × pay_i²) approximation.

    Notes
    -----
    ``_extract_paytable`` yields ``(combo_tuple, pay, cluster_size)`` tuples,
    not dicts — we destructure accordingly.
    """
    paytable = _extract_paytable(ir)
    reels = _extract_reels(ir)
    n_reels = len(reels) if reels else 5
    # Bernoulli per-symbol prob from strip composition.
    sym_counts: dict[str, int] = {}
    total_cells = 0
    for strip in reels or []:
        for s in strip:
            sym_counts[s] = sym_counts.get(s, 0) + 1
            total_cells += 1
    if total_cells == 0:
        return 0.0
    cells_per_reel = max(total_cells / max(n_reels, 1), 1.0)
    second_moment = 0.0
    for entry in paytable or []:
        if not isinstance(entry, tuple) or len(entry) < 2:
            continue
        combo, pays = entry[0], float(entry[1])
        if not combo or pays <= 0:
            continue
        p = 1.0
        for s in combo:
            cnt = sym_counts.get(s, 0)
            if cnt == 0:
                p = 0.0
                break
            p *= cnt / cells_per_reel
        if p > 1.0:
            p = 1.0
        second_moment += p * pays * pays
    return math.sqrt(second_moment)


def _summarize_one(ir_path: Path, ir: dict[str, Any]) -> GameSummary:
    meta = ir.get("meta") or {}
    name = meta.get("name") or meta.get("id") or ir_path.stem
    vendor = meta.get("vendor", "")
    swid = meta.get("swid", "")
    target = meta.get("target_rtp")
    est = bernoulli_rtp_estimate(ir)
    severity, delta = _classify_rtp(target, est)
    feat_kinds = list(_normalize_features(ir.get("features")))

    pt = _extract_paytable(ir)
    summary = GameSummary(
        rel_path=str(ir_path),
        name=str(name),
        vendor=str(vendor),
        swid=str(swid),
        target_rtp=float(target) if isinstance(target, (int, float)) else None,
        rtp_estimate=float(est) if est is not None else None,
        rtp_delta=delta,
        rtp_severity=severity,
        fingerprint=fingerprint(ir),
        feature_kinds=feat_kinds,
        paytable_depth=len(pt or []),
        reel_diversity=_reel_diversity(ir),
        volatility_proxy=_volatility_proxy(ir),
    )

    # Sidecar artifacts (cert XML / ZIP / telemetry pointer)
    game_dir = ir_path.parent
    # IR files are typically named ``<game>.ir.json``; strip the
    # ``.ir`` suffix so sidecars at ``<game>.cert.xml`` are also
    # discovered.
    stem = ir_path.stem
    base_stem = stem[: -len(".ir")] if stem.endswith(".ir") else stem
    summary.cert_xml_present = any(
        p.exists()
        for p in (
            game_dir / "cert.xml",
            game_dir / f"{stem}.cert.xml",
            game_dir / f"{base_stem}.cert.xml",
            game_dir / "out" / "cert.xml",
        )
    )
    summary.cert_zip_present = any(
        p.exists()
        for p in (
            game_dir / "cert.zip",
            game_dir / f"{stem}.cert.zip",
            game_dir / f"{base_stem}.cert.zip",
            game_dir / "out" / "cert.zip",
        )
    )
    summary.telemetry_pointer = bool(
        (meta.get("telemetry") or {}).get("endpoint")
    ) if isinstance(meta.get("telemetry"), dict) else False

    # Traffic light ranking
    light = "green"
    issues: list[str] = []
    if severity == "red":
        light = "red"
        issues.append(f"RTP drift ≥0.01: estimate {est}, target {target}")
    elif severity == "yellow" and light != "red":
        light = "yellow"
        issues.append(f"RTP drift 0.005–0.01: estimate {est}, target {target}")
    if not summary.cert_xml_present:
        if light == "green":
            light = "yellow"
        issues.append("cert.xml sidecar missing")
    if not summary.cert_zip_present:
        if light == "green":
            light = "yellow"
        issues.append("cert.zip sidecar missing")
    if not summary.telemetry_pointer:
        if light == "green":
            light = "yellow"
        issues.append("no telemetry endpoint in meta")
    summary.traffic_light = light
    summary.issues = issues
    return summary


# ─── public API ────────────────────────────────────────────────────


def aggregate(games_root: Path, *, glob: str = "*.ir.json") -> DashboardReport:
    """Walk ``games_root`` for IR files and aggregate per-game summaries."""
    games_root = Path(games_root)
    report = DashboardReport(generated_at_utc=_now_utc())
    if not games_root.exists():
        return report
    seen: set[Path] = set()
    patterns = (glob, "ir.json", "universal_ir.json")
    for pat in patterns:
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
            summary = _summarize_one(p, ir)
            report.games.append(summary)
    counts = {"green": 0, "yellow": 0, "red": 0}
    for g in report.games:
        counts[g.traffic_light] = counts.get(g.traffic_light, 0) + 1
    counts["total"] = len(report.games)
    report.counts = counts
    return report


def _now_utc() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# ─── HTML emitter ──────────────────────────────────────────────────


def _light_color(state: str) -> str:
    return {"green": "#1e8e3e", "yellow": "#e9a73a", "red": "#c5363f"}.get(
        state, "#888"
    )


def _emit_html(report: DashboardReport) -> str:
    rows = []
    def _fmt(v, spec=".4f"):
        if v is None:
            return "—"
        try:
            return format(v, spec)
        except (TypeError, ValueError):
            return str(v)

    for g in report.games:
        color = _light_color(g.traffic_light)
        issues = "<br/>".join(g.issues) or "—"
        rows.append(
            "<tr>"
            f"<td><span class='dot' style='background:{color}'></span></td>"
            f"<td>{g.name}</td>"
            f"<td>{g.vendor}</td>"
            f"<td>{g.swid}</td>"
            f"<td>{_fmt(g.target_rtp, '.4f')}</td>"
            f"<td>{_fmt(g.rtp_estimate, '.4f')}</td>"
            f"<td>{_fmt(g.rtp_delta, '.4f')}</td>"
            f"<td>{g.rtp_severity}</td>"
            f"<td>{g.paytable_depth}</td>"
            f"<td>{_fmt(g.reel_diversity, '.3f')}</td>"
            f"<td>{_fmt(g.volatility_proxy, '.3f')}</td>"
            f"<td>{', '.join(g.feature_kinds)}</td>"
            f"<td>{issues}</td>"
            "</tr>"
        )
    counts = report.counts
    legend = (
        f"<div class='legend'>"
        f"<span class='dot' style='background:{_light_color('green')}'></span> "
        f"green={counts.get('green', 0)} · "
        f"<span class='dot' style='background:{_light_color('yellow')}'></span> "
        f"yellow={counts.get('yellow', 0)} · "
        f"<span class='dot' style='background:{_light_color('red')}'></span> "
        f"red={counts.get('red', 0)} · "
        f"total={counts.get('total', 0)}"
        f"</div>"
    )
    return f"""<!DOCTYPE html>
<html><head><meta charset='utf-8'><title>Operator Dashboard</title>
<style>
  body {{ font-family: -apple-system, sans-serif; padding: 16px;
          background: #0f1115; color: #e7e7e7; }}
  h1 {{ margin: 0 0 8px; font-weight: 500; }}
  .legend {{ margin: 12px 0; }}
  .dot {{ display: inline-block; width: 12px; height: 12px;
          border-radius: 6px; vertical-align: middle; margin-right: 4px; }}
  table {{ border-collapse: collapse; width: 100%; font-size: 13px; }}
  th, td {{ border-bottom: 1px solid #2a2d36; padding: 6px 8px;
            text-align: left; vertical-align: top; }}
  th {{ color: #9aa3b2; font-weight: 500; }}
  tr:hover {{ background: #181b22; }}
</style></head><body>
<h1>Operator Dashboard</h1>
<p>Generated {report.generated_at_utc}</p>
{legend}
<table>
<thead><tr><th>Light</th><th>Name</th><th>Vendor</th><th>SWID</th>
<th>Target</th><th>Est RTP</th><th>Δ</th><th>Severity</th>
<th>PT depth</th><th>Reel div.</th><th>Vol proxy</th>
<th>Features</th><th>Issues</th></tr></thead>
<tbody>{''.join(rows) or '<tr><td colspan="13">no games</td></tr>'}</tbody>
</table>
</body></html>
"""


def emit_dashboard(report: DashboardReport, out_dir: Path) -> dict[str, Path]:
    """Write ``dashboard.html`` + ``dashboard.json`` into ``out_dir``."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "dashboard.html"
    json_path = out_dir / "dashboard.json"
    html_path.write_text(_emit_html(report), encoding="utf-8")
    json_path.write_text(json.dumps(report.to_dict(), indent=2))
    return {"html": html_path, "json": json_path}
