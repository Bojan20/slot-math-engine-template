"""W6.8 — Catalog HTML report generator.

Renders the JSON catalog (from `tools.math_dsl.catalog.build_catalog`)
as a single-file HTML report with client-side filtering (no React, no
build step — vanilla JS + a tiny CSS shell). Drop the output into
`out/catalog.html` and open in any browser; ready for sales decks /
internal vendor portal.
"""

from __future__ import annotations

import html
import json


_HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CORTEX Slot Catalog — generated {generated_at}</title>
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
         margin: 0; background: #0f172a; color: #e2e8f0; }}
  header {{ background: #1e293b; padding: 1.2rem 2rem; border-bottom: 2px solid #334155; }}
  h1 {{ margin: 0; font-size: 1.4rem; font-weight: 600; }}
  .meta {{ color: #94a3b8; font-size: 0.85rem; margin-top: 0.3rem; }}
  .filters {{ padding: 1rem 2rem; background: #1e293b; border-bottom: 1px solid #334155;
              display: flex; gap: 1rem; flex-wrap: wrap; }}
  .filters label {{ font-size: 0.85rem; color: #cbd5e1; }}
  .filters select {{ background: #0f172a; color: #e2e8f0; border: 1px solid #475569;
                     padding: 0.4rem 0.6rem; border-radius: 4px; margin-left: 0.4rem; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ padding: 0.6rem 1rem; text-align: left; border-bottom: 1px solid #334155;
           font-size: 0.88rem; }}
  th {{ background: #1e293b; font-weight: 600; color: #94a3b8; text-transform: uppercase;
        font-size: 0.7rem; letter-spacing: 0.05em; }}
  tr:hover {{ background: #1e293b; }}
  .name {{ font-weight: 600; color: #93c5fd; }}
  .vol-low {{ color: #86efac; }}
  .vol-medium {{ color: #fde047; }}
  .vol-high {{ color: #fb923c; }}
  .vol-ultra {{ color: #f87171; font-weight: 700; }}
  .badge {{ display: inline-block; padding: 0.15rem 0.5rem; border-radius: 3px;
            background: #334155; font-size: 0.72rem; margin-right: 0.25rem; }}
  .footer {{ padding: 1rem 2rem; color: #64748b; font-size: 0.78rem; }}
  #count {{ color: #fbbf24; font-weight: 600; }}
</style>
</head>
<body>
<header>
  <h1>CORTEX Slot Catalog</h1>
  <div class="meta">Generated {generated_at} · {count} game(s) · scanned from <code>{specs_dir}</code></div>
</header>

<div class="filters">
  <label>Topology:
    <select id="f-topology">
      <option value="">(all)</option>
      {topology_options}
    </select>
  </label>
  <label>Volatility:
    <select id="f-volatility">
      <option value="">(all)</option>
      <option value="low">low</option>
      <option value="medium">medium</option>
      <option value="high">high</option>
      <option value="ultra">ultra</option>
    </select>
  </label>
  <label>Jurisdiction:
    <select id="f-jurisdiction">
      <option value="">(all)</option>
      {jurisdiction_options}
    </select>
  </label>
  <label>Feature:
    <select id="f-feature">
      <option value="">(all)</option>
      {feature_options}
    </select>
  </label>
  <span style="margin-left:auto;color:#94a3b8;">Showing <span id="count">{count}</span> game(s)</span>
</div>

<table id="catalog-table">
  <thead>
    <tr>
      <th>Name</th>
      <th>Vendor</th>
      <th>Topology</th>
      <th>RTP</th>
      <th>Volatility</th>
      <th>Hit Freq</th>
      <th>Max Win×</th>
      <th>Features</th>
      <th>Jurisdictions</th>
    </tr>
  </thead>
  <tbody id="catalog-body">
  </tbody>
</table>

<div class="footer">
  Source: <code>tools.math_dsl.catalog.build_catalog</code> · Renderer:
  <code>tools.math_dsl.catalog_html.render_catalog_html</code> · MIT
</div>

<script>
const DATA = {data_json};

function volClass(v) {{ return v ? "vol-" + v : ""; }}
function badge(s) {{ return '<span class="badge">' + s + '</span>'; }}

function render() {{
  const ft = document.getElementById("f-topology").value;
  const fv = document.getElementById("f-volatility").value;
  const fj = document.getElementById("f-jurisdiction").value;
  const ff = document.getElementById("f-feature").value;
  const tbody = document.getElementById("catalog-body");
  tbody.innerHTML = "";
  let shown = 0;
  for (const s of DATA) {{
    if (ft && s.topology_kind !== ft) continue;
    if (fv && s.volatility_class !== fv) continue;
    if (fj && !s.jurisdictions.includes(fj)) continue;
    if (ff && !s.features.includes(ff)) continue;
    shown++;
    const tr = document.createElement("tr");
    tr.innerHTML = [
      '<td class="name">' + s.name + '</td>',
      '<td>' + (s.vendor || '') + '</td>',
      '<td>' + s.topology + '</td>',
      '<td>' + (s.target_rtp*100).toFixed(2) + '%</td>',
      '<td class="' + volClass(s.volatility_class) + '">' + s.volatility_class + '</td>',
      '<td>' + (s.hit_freq_target*100).toFixed(1) + '%</td>',
      '<td>' + (s.max_win_x || 0) + '×</td>',
      '<td>' + s.features.map(badge).join('') + '</td>',
      '<td>' + s.jurisdictions.map(badge).join('') + '</td>',
    ].join('');
    tbody.appendChild(tr);
  }}
  document.getElementById("count").textContent = shown;
}}

document.querySelectorAll("select").forEach(s => s.addEventListener("change", render));
render();
</script>
</body>
</html>
"""


def _option_list(values: list[str]) -> str:
    out = []
    for v in sorted(set(values)):
        if not v:
            continue
        safe = html.escape(str(v))
        out.append(f'<option value="{safe}">{safe}</option>')
    return "\n      ".join(out)


def render_catalog_html(catalog: dict) -> str:
    """Render the JSON catalog as a self-contained HTML file."""
    specs = catalog.get("specs", [])
    topology_kinds = list({s.get("topology_kind", "") for s in specs})
    jurisdictions: list[str] = []
    for s in specs:
        jurisdictions.extend(s.get("jurisdictions", []) or [])
    features: list[str] = []
    for s in specs:
        features.extend(s.get("features", []) or [])

    return _HTML_TEMPLATE.format(
        generated_at=html.escape(str(catalog.get("generated_at_utc", ""))),
        count=int(catalog.get("count", 0)),
        specs_dir=html.escape(str(catalog.get("specs_dir", ""))),
        topology_options=_option_list(topology_kinds),
        jurisdiction_options=_option_list(jurisdictions),
        feature_options=_option_list(features),
        data_json=json.dumps(specs),
    )
