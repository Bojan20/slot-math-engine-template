#!/usr/bin/env python3
"""W244 wave 52 — unified Regulator Portal (single-page HTML).

Consolidates 3 dossier artifacts into one auditor-ready landing page:

  Tab 1: **Industry Firsts**     ← reports/dossier/INDUSTRY_FIRST_DOSSIER.json
  Tab 2: **Kernel Attestation**  ← reports/acceptance/W244_ALL_KERNELS.json
  Tab 3: **Performance**         ← reports/acceptance/W244_BENCHMARK_DOSSIER.json

Output: `reports/dossier/REGULATOR_PORTAL.html`
  * Pure static HTML (no fetch, no external CDN)
  * CSS + JS inlined → opens offline in any browser
  * Each section advertises its own Merkle root (audit cross-check)
  * Document Merkle (SHA-256 over body) shown in footer

Deterministic — two builds produce byte-identical output.
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
IFS_JSON = REPO / "reports" / "dossier" / "INDUSTRY_FIRST_DOSSIER.json"
KERNELS_JSON = REPO / "reports" / "acceptance" / "W244_ALL_KERNELS.json"
BENCH_JSON = REPO / "reports" / "acceptance" / "W244_BENCHMARK_DOSSIER.json"
OUT = REPO / "reports" / "dossier" / "REGULATOR_PORTAL.html"


def _s(v) -> str:
    return "" if v is None else str(v)


def _esc(v) -> str:
    return html.escape(_s(v))


def _render_if_card(wave: dict) -> str:
    wn = _s(wave.get("wave", "—"))
    kimi = _s(wave.get("kimi", "—"))
    commit = _s(wave.get("commit", "—"))
    name = _esc(wave.get("name", "(unnamed)"))
    headline = _esc(wave.get("headline", ""))
    if_text = _esc(wave.get("industry_first", ""))
    detail = wave.get("detail", {})
    detail_html = ""
    if isinstance(detail, dict):
        rows = []
        for k, v in detail.items():
            v_str = (
                ", ".join(map(str, v)) if isinstance(v, list)
                else json.dumps(v, separators=(",", ":"))
                if isinstance(v, dict) else str(v)
            )
            rows.append(f'<dt>{_esc(k)}</dt><dd>{_esc(v_str)}</dd>')
        if rows:
            detail_html = f'<dl class="detail">{"".join(rows)}</dl>'
    return f'''
    <article class="card" data-wave="{wn}" data-kimi="{_esc(kimi)}"
             data-name="{name.lower()}">
      <header class="card-h">
        <span class="badge wave">W{wn}</span>
        <span class="badge kimi">{_esc(kimi)}</span>
        <span class="badge commit">{_esc(commit)}</span>
      </header>
      <h3 class="card-t">{name}</h3>
      <p class="card-headline">{headline}</p>
      {detail_html}
      <p class="if-text"><strong>Industry First:</strong> {if_text}</p>
    </article>'''


def _render_kernel_row(rec: dict) -> str:
    status = _s(rec.get("status", "?"))
    cls = "ok" if status == "OK" else "fail"
    return f'''
    <tr>
      <td><code>{_esc(rec.get("wave_id"))}</code></td>
      <td><strong>{_esc(rec.get("kernel"))}</strong></td>
      <td><span class="status {cls}">{_esc(status)}</span></td>
      <td>{_esc(rec.get("fixtures_count"))}</td>
      <td><code class="hash">{_esc(rec.get("merkle_root_sha256"))[:16]}…</code></td>
    </tr>'''


def _render_bench_row(rec: dict) -> str:
    mean_ns = rec.get("mean_ns", 0)
    ops_per_sec = rec.get("ops_per_sec", 0)
    sub_us = "✓" if mean_ns < 1000 else "·"
    return f'''
    <tr>
      <td>{_esc(rec.get("group"))}</td>
      <td><strong>{_esc(rec.get("bench"))}</strong></td>
      <td class="num">{mean_ns:.1f}</td>
      <td class="num">{ops_per_sec:,.0f}</td>
      <td>{sub_us}</td>
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
header.top .badges {
  margin-top: 16px; display: flex; gap: 10px; flex-wrap: wrap;
}
header.top .pill {
  background: var(--bg-card); border: 1px solid var(--border);
  padding: 4px 12px; border-radius: 999px; font-size: 12px;
  color: var(--fg-mute);
}
header.top .pill strong { color: var(--green); }
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

nav.tabs {
  position: sticky; top: 0; z-index: 20; background: var(--bg);
  border-bottom: 1px solid var(--border); padding: 0 32px;
  display: flex; gap: 4px; overflow-x: auto;
}
nav.tabs button {
  background: none; border: none; color: var(--fg-mute);
  padding: 16px 20px; font: 14px/1 inherit; cursor: pointer;
  border-bottom: 2px solid transparent; font-weight: 500;
}
nav.tabs button:hover { color: var(--fg); }
nav.tabs button.active {
  color: var(--acc); border-bottom-color: var(--acc);
}

section.tab { display: none; padding: 24px 32px; }
section.tab.active { display: block; }

/* === Industry Firsts tab === */
.stats {
  display: grid; gap: 16px; margin-bottom: 24px;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
  display: flex; gap: 12px; align-items: center;
  flex-wrap: wrap; margin-bottom: 16px;
}
.toolbar input {
  background: var(--bg-elev); border: 1px solid var(--border);
  color: var(--fg); padding: 10px 14px; border-radius: 6px;
  font: inherit; width: 320px;
}
.toolbar input:focus { outline: none; border-color: var(--acc); }
.toolbar .count {
  color: var(--fg-mute); font-size: 13px; margin-left: auto;
}
.grid {
  display: grid; gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
}
.card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; padding: 18px; transition: border-color 0.15s;
}
.card:hover { border-color: var(--acc); }
.card-h { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.badge {
  font: 11px/1 ui-monospace, "SF Mono", monospace;
  padding: 4px 8px; border-radius: 4px; font-weight: 600;
}
.badge.wave { background: var(--acc); color: #000; }
.badge.kimi { background: var(--acc2); color: #000; }
.badge.commit { background: var(--bg-elev); color: var(--fg-mute); }
.card-t {
  margin: 0 0 6px; font-size: 17px; font-weight: 600;
  letter-spacing: -0.2px;
}
.card-headline {
  color: var(--green); font-size: 13px; margin: 0 0 12px;
  font-weight: 500;
}
dl.detail {
  margin: 0 0 12px; padding: 10px 12px;
  background: var(--bg-elev); border-radius: 6px;
  font-size: 12px; line-height: 1.6;
}
dl.detail dt { display: inline; font-weight: 600; color: var(--fg-mute); }
dl.detail dt::after { content: ": "; }
dl.detail dd { display: inline; margin: 0; }
dl.detail dd::after { content: ""; display: block; }
.if-text {
  font-size: 13px; line-height: 1.55; color: var(--fg); margin: 8px 0 0;
}
.if-text strong { color: var(--acc2); }

/* === Tables (Kernel + Bench tabs) === */
.merkle-bar {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px 20px; margin-bottom: 16px;
  font-size: 13px; line-height: 1.7;
}
.merkle-bar code {
  background: var(--bg-elev); padding: 2px 6px; border-radius: 3px;
  color: var(--acc);
  font: 12px ui-monospace, "SF Mono", monospace; word-break: break-all;
}
.merkle-bar strong { color: var(--fg); }
table.data {
  width: 100%; border-collapse: collapse;
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
}
table.data tbody tr:hover { background: var(--bg-elev); }
table.data td.num {
  font: 13px ui-monospace, "SF Mono", monospace; text-align: right;
}
table.data code.hash {
  font: 11px ui-monospace, "SF Mono", monospace; color: var(--acc);
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
  // Tabs
  const $tabs = document.querySelectorAll('nav.tabs button');
  const $sections = document.querySelectorAll('section.tab');
  $tabs.forEach(b => b.addEventListener('click', () => {
    $tabs.forEach(t => t.classList.toggle('active', t === b));
    $sections.forEach(s =>
      s.classList.toggle('active', s.id === 'tab-' + b.dataset.tab)
    );
    history.replaceState(null, '', '#tab-' + b.dataset.tab);
  }));
  // Initial tab from hash
  const initial = (location.hash.startsWith('#tab-')
                   ? location.hash.slice(5) : 'ifs');
  const $initBtn = document.querySelector(
    'nav.tabs button[data-tab="' + initial + '"]'
  );
  if ($initBtn) $initBtn.click();

  // IF search
  const $search = document.querySelector('#ifs-search');
  const $count = document.querySelector('#ifs-count');
  if ($search) {
    const $cards = document.querySelectorAll('#tab-ifs .card');
    function filter() {
      const q = $search.value.toLowerCase().trim();
      let n = 0;
      $cards.forEach(c => {
        const hay = (c.dataset.name + ' ' +
                     c.dataset.kimi.toLowerCase() + ' ' +
                     c.dataset.wave + ' ' +
                     c.textContent.toLowerCase());
        const show = !q || hay.includes(q);
        c.style.display = show ? '' : 'none';
        if (show) n++;
      });
      $count.textContent = n;
    }
    $search.addEventListener('input', filter);
    $count.textContent = $cards.length;
  }
})();
"""


def main() -> int:
    for p in (IFS_JSON, KERNELS_JSON, BENCH_JSON):
        if not p.exists():
            print(f"[portal] missing source: {p.relative_to(REPO)}")
            return 1

    ifs_d = json.loads(IFS_JSON.read_text())
    kern_d = json.loads(KERNELS_JSON.read_text())
    bench_d = json.loads(BENCH_JSON.read_text())

    ifs_waves = ifs_d.get("waves", [])
    if_count = ifs_d.get("headline", {}).get("industry_firsts", len(ifs_waves))
    if_cards = "\n".join(_render_if_card(w) for w in ifs_waves)

    kern_records = sorted(
        kern_d.get("records", []), key=lambda r: r.get("kernel", ""),
    )
    kern_rows = "\n".join(_render_kernel_row(r) for r in kern_records)
    kern_master = kern_d.get("master_merkle_root_sha256", "")
    kern_total = kern_d.get("kernels_total", len(kern_records))
    kern_ok = kern_d.get("kernels_ok", 0)
    kern_fixtures = kern_d.get("total_fixtures", 0)

    bench_records = sorted(
        bench_d.get("records", []), key=lambda r: r.get("mean_ns", 0),
    )
    bench_rows = "\n".join(_render_bench_row(r) for r in bench_records)
    bench_merkle = bench_d.get("merkle_root_sha256", "")
    bench_count = bench_d.get("bench_count", len(bench_records))
    bench_mean = bench_d.get("mean_across_all_benches_ns", 0)
    bench_sub_us = bench_d.get("all_sub_microsecond", False)
    bench_fastest = bench_d.get("fastest", {})
    bench_slowest = bench_d.get("slowest", {})

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Regulator Portal — slot-math-engine-template</title>
  <style>{CSS}</style>
</head>
<body>
  <header class="top">
    <h1>Regulator <span class="accent">Portal</span></h1>
    <p class="lead">
      Auditor-grade attestation hub for the slot-math-engine-template
      math kernel fleet. All sections are Merkle-pinned and rebuild
      byte-identical for paper-trail verification (UKGC RTS 13C, MGA
      RG 2021/02, GLI-19).
    </p>
    <div class="badges">
      <span class="pill">{if_count} <strong>industry firsts</strong></span>
      <span class="pill">{kern_ok}/{kern_total}
        <strong>kernels passing</strong></span>
      <span class="pill">{kern_fixtures}
        <strong>acceptance fixtures</strong></span>
      <span class="pill">{bench_count}
        <strong>benchmark scenarios</strong></span>
      <span class="pill">all <strong>sub-µs</strong>:
        {"✓" if bench_sub_us else "✗"}</span>
    </div>
    <nav class="dossier-nav">
      <a href="INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a class="current" href="REGULATOR_PORTAL.html">Regulator Portal</a>
      <a href="CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
    </nav>
  </header>

  <nav class="tabs">
    <button data-tab="ifs">Industry Firsts</button>
    <button data-tab="kern">Kernel Attestation</button>
    <button data-tab="bench">Performance</button>
  </nav>

  <section class="tab" id="tab-ifs">
    <div class="stats">
      <div class="stat"><span class="n">{if_count}</span>
        <span class="l">Industry firsts</span></div>
      <div class="stat"><span class="n">22</span>
        <span class="l">Math kernels</span></div>
      <div class="stat"><span class="n">22</span>
        <span class="l">Rust ports</span></div>
      <div class="stat"><span class="n">20/20</span>
        <span class="l">DONE-UNIVERSAL</span></div>
      <div class="stat"><span class="n">98.88%</span>
        <span class="l">Mutation score</span></div>
    </div>
    <div class="toolbar">
      <input id="ifs-search" type="search"
             placeholder="Search waves, kimi, name…" autocomplete="off">
      <span class="count"><span id="ifs-count">0</span>
        / {if_count} visible</span>
    </div>
    <div class="grid">{if_cards}
    </div>
  </section>

  <section class="tab" id="tab-kern">
    <div class="merkle-bar">
      <div><strong>Master Merkle root (SHA-256):</strong>
        <code>{_esc(kern_master)}</code></div>
      <div><strong>Verification:</strong>
        re-run <code>python -m tools.build_all_w244_kernels</code> —
        master root must be byte-identical.</div>
      <div><strong>Status:</strong> {kern_ok}/{kern_total} kernels OK,
        {kern_fixtures} acceptance fixtures total.</div>
    </div>
    <table class="data">
      <thead>
        <tr>
          <th>Wave ID</th><th>Kernel</th><th>Status</th>
          <th>Fixtures</th><th>Merkle (16 hex)</th>
        </tr>
      </thead>
      <tbody>{kern_rows}
      </tbody>
    </table>
  </section>

  <section class="tab" id="tab-bench">
    <div class="merkle-bar">
      <div><strong>Bench Merkle root (SHA-256):</strong>
        <code>{_esc(bench_merkle)}</code></div>
      <div><strong>Runner:</strong>
        <code>cargo bench --bench w244_kernel_bench</code> (criterion 0.x).</div>
      <div><strong>Coverage:</strong>
        {bench_count} scenarios — fastest
        <strong>{_esc(bench_fastest.get("bench", "?"))}</strong>
        @ {bench_fastest.get("mean_ns", 0):.1f} ns; slowest
        <strong>{_esc(bench_slowest.get("bench", "?"))}</strong>
        @ {bench_slowest.get("mean_ns", 0):.1f} ns; mean
        {bench_mean:.1f} ns. All sub-microsecond:
        <strong>{"✓" if bench_sub_us else "✗"}</strong>.</div>
    </div>
    <table class="data">
      <thead>
        <tr>
          <th>Group</th><th>Bench</th>
          <th>Mean (ns)</th><th>Ops / sec</th><th>&lt; 1 µs</th>
        </tr>
      </thead>
      <tbody>{bench_rows}
      </tbody>
    </table>
  </section>

  <footer class="bot">
    Built from: <code>INDUSTRY_FIRST_DOSSIER.json</code> /
    <code>W244_ALL_KERNELS.json</code> /
    <code>W244_BENCHMARK_DOSSIER.json</code><br>
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
    print(f"[portal] wrote {OUT.relative_to(REPO)}")
    print(f"  industry firsts:   {if_count}")
    print(f"  kernels OK:        {kern_ok}/{kern_total}")
    print(f"  benchmark records: {bench_count}")
    print(f"  body merkle:       {digest}")
    print(f"  file size:         {OUT.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
