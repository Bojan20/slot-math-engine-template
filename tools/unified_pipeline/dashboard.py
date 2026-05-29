"""W7.11 — Unified Audit Pipeline HTML dashboard.

Renders an **offline-first** self-contained HTML page from a
UnifiedAuditReport JSON file. The page shows:

* Consolidated hash + per-kernel sub-hashes (one click → expand sub-detail).
* Pareto frontier table (W7.1) with row click → fitness vector detail.
* RL KPI cards (W7.3).
* Asset manifest brief (W7.4).
* Audit panel: every sub-hash highlighted, side-by-side with the JSON
  it commits to.

Zero CDN, zero fetch — inline JSON + vanilla JS.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

from .pipeline import UnifiedAuditReport


_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SLOT-MATH-ENGINE — Unified Audit Pipeline (W7.11)</title>
<style>
:root {{
  --bg: #0e1116; --panel: #161b22; --panel-2: #1b2129;
  --text: #e6e6e6; --muted: #9aa4b2; --accent: #3fb950;
  --warn: #d29922; --fail: #f85149; --grid: #2d333b;
  --mono: ui-monospace, "JetBrains Mono", Menlo, monospace;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg); color: var(--text); font-size: 13px; line-height: 1.5;
}}
header {{
  padding: 20px 28px; border-bottom: 1px solid var(--grid);
  display: flex; align-items: baseline; justify-content: space-between;
}}
header h1 {{ margin: 0; font-size: 18px; font-weight: 600; }}
header .meta {{ color: var(--muted); font-size: 12px; }}
main {{ padding: 20px 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }}
.panel {{ background: var(--panel); border-radius: 6px; padding: 14px; }}
.panel.span2 {{ grid-column: 1 / span 2; }}
.panel h2 {{ margin: 0 0 8px 0; font-size: 13px; color: var(--muted);
              text-transform: uppercase; letter-spacing: 0.04em; }}
.hash-row {{ display: flex; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--grid);
              align-items: center; }}
.hash-row:last-child {{ border: none; }}
.hash-label {{ color: var(--muted); width: 220px; font-size: 12px; }}
.hash-value {{ font-family: var(--mono); font-size: 11px; color: var(--accent); flex: 1;
                word-break: break-all; }}
.consolidated {{ background: rgba(63, 185, 80, 0.07); padding: 12px;
                   border: 1px solid var(--accent); border-radius: 4px; margin-bottom: 12px; }}
.consolidated .label {{ color: var(--muted); font-size: 11px;
                          text-transform: uppercase; letter-spacing: 0.06em; }}
.consolidated .value {{ font-family: var(--mono); font-size: 14px; color: var(--accent);
                         margin-top: 4px; word-break: break-all; font-weight: 600; }}
.kpi-row {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }}
.kpi {{ background: var(--panel-2); padding: 10px; border-radius: 4px; }}
.kpi .label {{ color: var(--muted); font-size: 10px;
                 text-transform: uppercase; letter-spacing: 0.06em; }}
.kpi .value {{ font-size: 18px; font-weight: 600; margin-top: 2px; }}
table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
th, td {{ padding: 6px 10px; text-align: left; border-bottom: 1px solid var(--grid);
           vertical-align: top; }}
th {{ background: var(--panel-2); font-weight: 600; color: var(--muted); font-size: 11px;
       text-transform: uppercase; letter-spacing: 0.04em; }}
td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
tr.row {{ cursor: pointer; }}
tr.row:hover {{ background: var(--panel-2); }}
tr.row.selected {{ background: rgba(63, 185, 80, 0.08); }}
pre {{ background: var(--bg); padding: 10px; border-radius: 4px;
       border: 1px solid var(--grid); overflow: auto; font-size: 11px; margin: 0; }}
.footer {{ padding: 16px 28px; color: var(--muted); font-size: 11px;
            border-top: 1px solid var(--grid); }}
</style>
</head>
<body>
<header>
  <h1>Unified Audit Pipeline (W7.11)</h1>
  <span class="meta">{summary}</span>
</header>
<main>
  <div class="panel span2">
    <h2>Consolidated commitment</h2>
    <div class="consolidated">
      <div class="label">consolidated_hash (SHA-256 over every sub-manifest)</div>
      <div class="value">{consolidated_hash}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">gdd_hash (W7.4 input)</div>
      <div class="hash-value">{gdd_hash}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">asset_manifest_hash (W7.4)</div>
      <div class="hash-value">{asset_manifest_hash}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">derivative_manifest_hash (W7.6)</div>
      <div class="hash-value">{derivative_manifest_hash}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">pareto_hash (W7.1)</div>
      <div class="hash-value">{pareto_hash}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">rl_kpi_hash (W7.3)</div>
      <div class="hash-value">{rl_kpi_hash}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">session_mesh_root (W7.5)</div>
      <div class="hash-value">{session_mesh_root}</div>
    </div>
    <div class="hash-row">
      <div class="hash-label">js_bundle_sha256 (W7.7)</div>
      <div class="hash-value">{js_bundle_sha256}</div>
    </div>
  </div>

  <div class="panel">
    <h2>RL retention KPI (W7.3)</h2>
    <div class="kpi-row">
      <div class="kpi"><div class="label">Sessions</div><div class="value">{rl_sessions}</div></div>
      <div class="kpi"><div class="label">Avg LTV</div><div class="value">{rl_avg_ltv}</div></div>
      <div class="kpi"><div class="label">Bust rate</div><div class="value">{rl_bust}</div></div>
      <div class="kpi"><div class="label">Vol. quit</div><div class="value">{rl_quit}</div></div>
    </div>
    <pre id="rl-detail">{rl_kpi_json}</pre>
  </div>

  <div class="panel">
    <h2>Asset manifest brief (W7.4)</h2>
    <div class="kpi-row">
      <div class="kpi"><div class="label">Symbols</div><div class="value">{asset_symbols}</div></div>
      <div class="kpi"><div class="label">Scripts</div><div class="value">{asset_scripts}</div></div>
      <div class="kpi"><div class="label">BGM curves</div><div class="value">{asset_bgm}</div></div>
      <div class="kpi"><div class="label">GDD ID</div><div class="value" style="font-size:13px">{asset_gdd_id}</div></div>
    </div>
    <pre>{asset_brief_json}</pre>
  </div>

  <div class="panel span2">
    <h2>Pareto frontier (W7.1)</h2>
    <table id="pareto-table">
      <thead>
        <tr><th>#</th><th>RTP</th><th>CV</th><th>Hit freq</th>
        <th class="num">RTP err</th><th class="num">CV err</th>
        <th class="num">HF err</th><th class="num">Fairness</th></tr>
      </thead>
      <tbody id="pareto-body"></tbody>
    </table>
  </div>
</main>
<div class="footer">
  Generated from <code>UnifiedAuditReport</code> — offline-first, zero CDN, vanilla JS.
</div>
<script>
const PARETO = {pareto_json};
function fmtN(v, d) {{ return v == null ? "—" : Number(v).toFixed(d); }}
function fmtExp(v) {{ return v == null ? "—" : Number(v).toExponential(2); }}
const tbody = document.getElementById("pareto-body");
PARETO.forEach((m, i) => {{
  const tr = document.createElement("tr");
  tr.className = "row";
  tr.innerHTML = `
    <td>${{i}}</td>
    <td class="num">${{fmtN(m.rtp, 4)}}</td>
    <td class="num">${{fmtN(m.cv, 4)}}</td>
    <td class="num">${{fmtN(m.hit_freq, 4)}}</td>
    <td class="num">${{fmtExp(m.fitness[0])}}</td>
    <td class="num">${{fmtExp(m.fitness[1])}}</td>
    <td class="num">${{fmtExp(m.fitness[2])}}</td>
    <td class="num">${{fmtExp(m.fitness[3])}}</td>`;
  tbody.appendChild(tr);
}});
</script>
</body>
</html>
"""


def render_unified_audit_dashboard(report: UnifiedAuditReport) -> str:
    """Render a self-contained HTML dashboard for one UnifiedAuditReport."""
    rl = report.rl_kpi
    asset = report.asset_manifest_brief

    def short(h: str, n: int = 16) -> str:
        return h[:n] + "…" if len(h) > n else h

    return _TEMPLATE.format(
        summary=html.escape(
            f"GDD {asset.get('gdd_id', '—')} · "
            f"Pareto {len(report.pareto_summary)} · "
            f"RL {rl.get('sessions', 0)} sessions"
        ),
        consolidated_hash=html.escape(report.consolidated_hash),
        gdd_hash=html.escape(report.gdd_hash),
        asset_manifest_hash=html.escape(report.asset_manifest_hash),
        derivative_manifest_hash=html.escape(report.derivative_manifest_hash),
        pareto_hash=html.escape(report.pareto_hash),
        rl_kpi_hash=html.escape(report.rl_kpi_hash),
        session_mesh_root=html.escape(report.session_mesh_root),
        js_bundle_sha256=html.escape(report.js_bundle_sha256),
        rl_sessions=html.escape(str(rl.get("sessions", 0))),
        rl_avg_ltv=f"{rl.get('avg_ltv', 0):.2f}",
        rl_bust=f"{rl.get('bust_rate', 0):.0%}",
        rl_quit=f"{rl.get('voluntary_quit_rate', 0):.0%}",
        rl_kpi_json=html.escape(json.dumps(rl, indent=2, sort_keys=True)),
        asset_symbols=asset.get("n_symbol_assets", 0),
        asset_scripts=asset.get("n_narration_scripts", 0),
        asset_bgm=asset.get("n_bgm_curves", 0),
        asset_gdd_id=html.escape(str(asset.get("gdd_id", "—"))),
        asset_brief_json=html.escape(json.dumps(asset, indent=2, sort_keys=True)),
        pareto_json=json.dumps(report.pareto_summary, sort_keys=True),
    )


def write_unified_audit_dashboard(
    report: UnifiedAuditReport, out_path: Path,
) -> Path:
    html_str = render_unified_audit_dashboard(report)
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_str, encoding="utf-8")
    return out_path
