#!/usr/bin/env python3
"""W244 wave 83 — acceptance index HTML — auditor pregled svih JSON artefakta.

Renders `reports/dossier/acceptance_index.html` — single page sa table
of svih *_KERNEL.json + W244_*.json + WASM_*.json files pod
`reports/acceptance/`. Every row: filename, schema, Merkle short, size,
direct download link.

Auditor klikne na bilo koji red → downloaduje raw JSON za external
validation (ajv / jsonschema / vlastiti validator).
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ACCEPT = REPO / "reports" / "acceptance"
OUT = REPO / "reports" / "dossier" / "acceptance_index.html"


def _esc(v) -> str:
    return html.escape("" if v is None else str(v))


CSS = """
:root {
  --bg: #0a0e14; --bg-card: #131821; --bg-elev: #1c2230;
  --fg: #e6e9ef; --fg-mute: #9098a8;
  --acc: #4cc4ff; --acc2: #ffb84c; --green: #6dd49d;
  --border: #2a3142;
}
* { box-sizing: border-box; }
body {
  font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
  margin: 0; background: var(--bg); color: var(--fg);
}
header.top {
  padding: 36px 32px 20px;
  background: linear-gradient(180deg, #0e1320 0%, var(--bg) 100%);
  border-bottom: 1px solid var(--border);
}
header.top h1 {
  margin: 0 0 8px; font-size: 30px; font-weight: 700;
  letter-spacing: -0.5px;
}
header.top h1 .accent { color: var(--acc); }
header.top .lead {
  color: var(--fg-mute); font-size: 14px; max-width: 760px;
  margin: 0; line-height: 1.55;
}
.dossier-nav {
  margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;
}
.dossier-nav a {
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--fg-mute); text-decoration: none; padding: 7px 12px;
  border-radius: 6px; font-size: 12px;
}
.dossier-nav a:hover { border-color: var(--acc); color: var(--fg); }
.dossier-nav a.current {
  border-color: var(--acc); color: var(--acc); background: var(--bg-elev);
}
.toolbar {
  padding: 16px 32px; display: flex; gap: 12px; align-items: center;
  flex-wrap: wrap; border-bottom: 1px solid var(--border);
}
.toolbar input {
  background: var(--bg-elev); border: 1px solid var(--border);
  color: var(--fg); padding: 8px 12px; border-radius: 6px;
  font: inherit; width: 320px;
}
.toolbar input:focus { outline: none; border-color: var(--acc); }
.toolbar .count {
  color: var(--fg-mute); font-size: 13px; margin-left: auto;
}
table.data {
  width: 100%; border-collapse: collapse;
}
table.data thead {
  position: sticky; top: 0; background: var(--bg-elev);
}
table.data th, table.data td {
  padding: 10px 16px; text-align: left;
  border-bottom: 1px solid var(--border);
}
table.data thead th {
  color: var(--fg-mute); font: 11px/1 inherit; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
}
table.data tbody tr:hover { background: var(--bg-elev); }
table.data td.num {
  font: 13px ui-monospace, monospace; text-align: right;
}
table.data td code {
  font: 11px ui-monospace, monospace;
}
table.data td.hash {
  color: var(--acc); font: 11px ui-monospace, monospace;
}
table.data a {
  color: var(--acc); text-decoration: none;
}
table.data a:hover { text-decoration: underline; }
footer.bot {
  padding: 20px 32px 40px; color: var(--fg-mute); font-size: 12px;
  border-top: 1px solid var(--border); margin-top: 24px;
}
footer.bot code { color: var(--acc); }
"""

JS = """
(function () {
  var $s = document.getElementById('search');
  var $rows = document.querySelectorAll('tbody tr');
  var $c = document.getElementById('count');
  function f() {
    var q = $s.value.toLowerCase().trim();
    var n = 0;
    $rows.forEach(function (r) {
      var hay = r.textContent.toLowerCase();
      var show = !q || hay.indexOf(q) !== -1;
      r.style.display = show ? '' : 'none';
      if (show) n++;
    });
    $c.textContent = n;
  }
  $s.addEventListener('input', f);
  $c.textContent = $rows.length;
})();
"""


def main() -> int:
    files = sorted(ACCEPT.glob("*.json"))
    if not files:
        print("[acc-index] no acceptance JSONs found")
        return 1

    rows = []
    for f in files:
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        schema = d.get("schema", d.get("schema_version", "?"))
        merkle = (
            d.get("merkle_root_sha256")
            or d.get("master_merkle_root_sha256")
            or d.get("manifest_merkle_root_sha256")
            or ""
        )
        size_kb = f.stat().st_size / 1024
        # Number of records / fixtures / etc.
        count_field = (
            d.get("fixtures_count")
            or d.get("kernels_total")
            or d.get("bench_count")
            or d.get("scenarios_count")
            or (len(d.get("records", []))
                if isinstance(d.get("records"), list) else 0)
        )
        rows.append(f'''
    <tr>
      <td><a href="../acceptance/{_esc(f.name)}">
        <strong>{_esc(f.name)}</strong></a></td>
      <td><code>{_esc(schema)}</code></td>
      <td class="hash">{_esc(merkle[:24])}…</td>
      <td class="num">{count_field}</td>
      <td class="num">{size_kb:.1f} KB</td>
    </tr>''')

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Acceptance index — W244 artefakti</title>
  <style>{CSS}</style>
</head>
<body>
  <header class="top">
    <h1>Acceptance <span class="accent">index</span></h1>
    <p class="lead">
      Every Merkle-pinned acceptance / dossier JSON pod
      <code>reports/acceptance/</code>. Click a filename to download
      the raw JSON for external validation (ajv / jsonschema / vlastiti
      validator) against schemas u <code>reports/schemas/</code>.
    </p>
    <nav class="dossier-nav">
      <a href="index.html">↩ Landing</a>
      <a href="INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a href="REGULATOR_PORTAL.html">Regulator Portal</a>
      <a href="CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
      <a href="kernels/index.html">Kernel References</a>
      <a href="showcase_game.html">Showcase Game</a>
      <a class="current" href="acceptance_index.html">Acceptance Index</a>
    </nav>
  </header>

  <div class="toolbar">
    <input id="search" type="search"
           placeholder="Search by filename / schema / Merkle…"
           autocomplete="off">
    <span class="count"><span id="count">0</span>
      / {len(rows)} visible</span>
  </div>

  <table class="data">
    <thead>
      <tr>
        <th>Filename</th>
        <th>Schema</th>
        <th>Merkle (24-hex prefix)</th>
        <th>Records</th>
        <th>Size</th>
      </tr>
    </thead>
    <tbody>{"".join(rows)}
    </tbody>
  </table>

  <footer class="bot">
    Source: <code>reports/acceptance/*.json</code>
    ({len(rows)} files)<br>
    Validate externally:
    <code>ajv validate -s reports/schemas/&lt;X&gt;.schema.json
      -d reports/acceptance/&lt;Y&gt;.json</code><br>
    Reproduce:
    <code>./scripts/verify_all_merkles.sh</code><br>
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
    print(f"[acc-index] wrote {OUT.relative_to(REPO)}")
    print(f"  acceptance files:  {len(rows)}")
    print(f"  body merkle:       {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
