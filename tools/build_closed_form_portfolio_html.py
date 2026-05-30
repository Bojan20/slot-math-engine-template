#!/usr/bin/env python3
"""W244 wave 57 — HTML dashboard za Closed-Form Portfolio.

Renders `reports/dossier/CLOSED_FORM_PORTFOLIO_100.json` (120 closed-form
solver acceptance reports) as a self-contained static HTML page. Treća
komponenta dossier HTML triade (uz Industry First + Regulator Portal).

Output: `reports/dossier/CLOSED_FORM_PORTFOLIO.html` — pure-stdlib HTML,
CSS + JS inline, deterministic Merkle.
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "reports" / "dossier" / "CLOSED_FORM_PORTFOLIO_100.json"
OUT = REPO / "reports" / "dossier" / "CLOSED_FORM_PORTFOLIO.html"


def _esc(v) -> str:
    return html.escape("" if v is None else str(v))


def _render_row(rec: dict) -> str:
    name = _esc(rec.get("reportId", "?"))
    file_name = _esc(rec.get("fileName", "?"))
    total = rec.get("configsTotal", 0)
    passed = rec.get("configsPassed", 0)
    overall = rec.get("overallPass", False)
    status_cls = "ok" if overall else "fail"
    status_txt = "PASS" if overall else "FAIL"
    pct = (passed / total * 100) if total else 0.0
    return f'''
    <tr data-name="{name.lower()}" data-status="{status_txt}">
      <td><strong>{name}</strong>
        <div class="filename">{file_name}</div></td>
      <td class="num">{passed}/{total}</td>
      <td class="num">{pct:.0f}%</td>
      <td><span class="status {status_cls}">{status_txt}</span></td>
    </tr>'''


CSS = """
:root {
  --bg: #0a0e14; --bg-card: #131821; --bg-elev: #1c2230;
  --fg: #e6e9ef; --fg-mute: #9098a8;
  --acc: #4cc4ff; --acc2: #ffb84c; --green: #6dd49d; --red: #ff6b6b;
  --border: #2a3142;
}
* { box-sizing: border-box; }
body {
  font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
  margin: 0; background: var(--bg); color: var(--fg);
}
header.top {
  padding: 48px 32px 24px;
  background: linear-gradient(180deg, #0e1320 0%, var(--bg) 100%);
  border-bottom: 1px solid var(--border);
}
header.top h1 {
  margin: 0 0 8px; font-size: 36px; font-weight: 700;
  letter-spacing: -0.5px;
}
header.top h1 .accent { color: var(--acc); }
header.top .lead {
  color: var(--fg-mute); font-size: 16px; max-width: 820px; margin: 0;
}
.dossier-nav {
  margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap;
}
.dossier-nav a {
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--fg-mute); text-decoration: none; padding: 8px 14px;
  border-radius: 6px; font-size: 13px; font-weight: 500;
  transition: border-color 0.15s, color 0.15s;
}
.dossier-nav a:hover { border-color: var(--acc); color: var(--fg); }
.dossier-nav a.current {
  border-color: var(--acc); color: var(--acc); background: var(--bg-elev);
  cursor: default;
}
.stats {
  display: grid; gap: 16px; padding: 24px 32px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  border-bottom: 1px solid var(--border);
}
.stat {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px;
}
.stat .n {
  font-size: 28px; font-weight: 700; color: var(--acc); display: block;
}
.stat .l {
  color: var(--fg-mute); font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.5px; margin-top: 4px;
}
.toolbar {
  padding: 20px 32px; display: flex; gap: 12px; align-items: center;
  flex-wrap: wrap; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--bg); z-index: 10;
}
.toolbar input {
  background: var(--bg-elev); border: 1px solid var(--border);
  color: var(--fg); padding: 10px 14px; border-radius: 6px;
  font: inherit; width: 320px;
}
.toolbar select {
  background: var(--bg-elev); border: 1px solid var(--border);
  color: var(--fg); padding: 10px 14px; border-radius: 6px;
  font: inherit;
}
.toolbar input:focus, .toolbar select:focus {
  outline: none; border-color: var(--acc);
}
.toolbar .count {
  color: var(--fg-mute); font-size: 13px; margin-left: auto;
}
table.data {
  width: calc(100% - 64px); margin: 24px 32px; border-collapse: collapse;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; overflow: hidden;
}
table.data th, table.data td {
  padding: 10px 14px; text-align: left;
  border-bottom: 1px solid var(--border);
}
table.data thead th {
  background: var(--bg-elev); color: var(--fg-mute);
  font: 11px/1 inherit; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  position: sticky; top: 64px; z-index: 5;
}
table.data tbody tr:hover { background: var(--bg-elev); }
table.data td.num {
  font: 13px ui-monospace, "SF Mono", monospace; text-align: right;
}
.filename {
  font: 11px ui-monospace, "SF Mono", monospace; color: var(--fg-mute);
  margin-top: 2px;
}
.status { font-weight: 600; font-size: 11px; padding: 3px 8px; border-radius: 4px; }
.status.ok { background: rgba(109, 212, 157, 0.15); color: var(--green); }
.status.fail { background: rgba(255, 107, 107, 0.15); color: var(--red); }
footer.bot {
  padding: 24px 32px 48px; color: var(--fg-mute); font-size: 12px;
  border-top: 1px solid var(--border); margin-top: 32px;
}
footer.bot code { color: var(--acc); }
"""

JS = """
(function() {
  const $search = document.querySelector('#search');
  const $filter = document.querySelector('#filter');
  const $count = document.querySelector('#count');
  const $rows = document.querySelectorAll('tbody tr');
  function apply() {
    const q = $search.value.toLowerCase().trim();
    const f = $filter.value;
    let n = 0;
    $rows.forEach(r => {
      const matches_q = !q || r.dataset.name.includes(q);
      const matches_f = f === 'all' || r.dataset.status === f;
      const show = matches_q && matches_f;
      r.style.display = show ? '' : 'none';
      if (show) n++;
    });
    $count.textContent = n;
  }
  $search.addEventListener('input', apply);
  $filter.addEventListener('change', apply);
  $count.textContent = $rows.length;
})();
"""


def main() -> int:
    if not SRC.exists():
        print(f"[cf-html] missing source: {SRC.relative_to(REPO)}")
        return 1

    d = json.loads(SRC.read_text())
    reports = sorted(d.get("reports", []),
                     key=lambda r: (not r["overallPass"], r["reportId"]))
    total_reports = len(reports)
    total_configs = d.get("total_configs", 0)
    passed_configs = d.get("total_configs_passed", 0)
    pass_rate = float(d.get("pass_rate_pct", 0.0))
    milestone = d.get("portfolio_milestone", "?")
    overall_pass = sum(1 for r in reports if r["overallPass"])
    overall_fail = total_reports - overall_pass

    rows = "\n".join(_render_row(r) for r in reports)

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Closed-Form Portfolio — slot-math-engine-template</title>
  <style>{CSS}</style>
</head>
<body>
  <header class="top">
    <h1>Closed-Form <span class="accent">Portfolio</span></h1>
    <p class="lead">
      120 closed-form solvers across {total_configs} acceptance configs.
      Each row links to an MC-validated acceptance report under
      <code>reports/acceptance/</code>. The full portfolio is part of
      the {_esc(milestone)} milestone.
    </p>
    <nav class="dossier-nav">
      <a href="index.html">↩ Landing</a>
      <a href="INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a href="REGULATOR_PORTAL.html">Regulator Portal</a>
      <a class="current" href="CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
      <a href="kernels/index.html">Kernel References</a>
      <a href="showcase_game.html">Showcase Game</a>
      <a href="acceptance_index.html">Acceptance Index</a>
    </nav>
  </header>

  <section class="stats">
    <div class="stat"><span class="n">{total_reports}</span>
      <span class="l">Closed-form solvers</span></div>
    <div class="stat"><span class="n">{passed_configs}</span>
      <span class="l">Configs validated</span></div>
    <div class="stat"><span class="n">{overall_pass}</span>
      <span class="l">Reports passing</span></div>
    <div class="stat"><span class="n">{overall_fail}</span>
      <span class="l">Reports failing</span></div>
    <div class="stat"><span class="n">{pass_rate:.1f}%</span>
      <span class="l">Config pass rate</span></div>
  </section>

  <div class="toolbar">
    <input id="search" type="search"
           placeholder="Search by report ID…" autocomplete="off">
    <select id="filter">
      <option value="all">All statuses</option>
      <option value="PASS">PASS only</option>
      <option value="FAIL">FAIL only</option>
    </select>
    <span class="count"><span id="count">0</span>
      / {total_reports} visible</span>
  </div>

  <table class="data">
    <thead>
      <tr>
        <th>Report ID / file</th>
        <th>Configs</th>
        <th>%</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>{rows}
    </tbody>
  </table>

  <footer class="bot">
    Schema: <code>{_esc(d.get("schema_version", "?"))}</code><br>
    Generated UTC: <code>{_esc(d.get("generated_utc", "?"))}</code><br>
    Source: <code>reports/dossier/CLOSED_FORM_PORTFOLIO_100.json</code><br>
    Page Merkle (SHA-256 over body): <code>__MERKLE__</code>
  </footer>
  <script>{JS}</script>
</body>
</html>
"""
    body_for_hash = body.replace("__MERKLE__", "")
    digest = hashlib.sha256(body_for_hash.encode("utf-8")).hexdigest()
    body = body.replace("__MERKLE__", digest)

    OUT.write_text(body, encoding="utf-8")
    print(f"[cf-html] wrote {OUT.relative_to(REPO)}")
    print(f"  reports rendered: {total_reports}")
    print(f"  pass/fail:        {overall_pass}/{overall_fail}")
    print(f"  configs:          {passed_configs}/{total_configs}")
    print(f"  body merkle:      {digest}")
    print(f"  file size:        {OUT.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
