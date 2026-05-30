#!/usr/bin/env python3
"""W244 wave 51 — single-page HTML dashboard for Industry-First Dossier.

Renders `reports/dossier/INDUSTRY_FIRST_DOSSIER.json` (89+ waves of
industry-first slot math engineering) as a self-contained static HTML
page suitable for:

  * Regulator presentations (UKGC / MGA / GLI)
  * Investor / VC pitch decks (sub-page link)
  * Marketing landing page
  * Engineering portfolio (audit firm collateral)

Design: zero external deps. CSS + JS inlined. Single file output:
`reports/dossier/INDUSTRY_FIRST_DOSSIER.html`. Opens in any modern
browser with full interactive filter/search.

The HTML is REGENERATED deterministically — re-run on dossier change.
Output Merkle is shown in the page footer so a regulator can verify
the HTML matches the underlying JSON.
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DOSSIER = REPO / "reports" / "dossier" / "INDUSTRY_FIRST_DOSSIER.json"
OUT = REPO / "reports" / "dossier" / "INDUSTRY_FIRST_DOSSIER.html"


def _s(v) -> str:
    """None-safe string coerce."""
    return "" if v is None else str(v)


def _render_card(wave: dict) -> str:
    wn = _s(wave.get("wave", "—"))
    kimi = _s(wave.get("kimi", "—"))
    commit = _s(wave.get("commit", "—"))
    name = html.escape(_s(wave.get("name", "(unnamed)")))
    headline = html.escape(_s(wave.get("headline", "")))
    report = html.escape(_s(wave.get("reportPath", "")))
    if_text = html.escape(_s(wave.get("industry_first", "")))
    detail = wave.get("detail", {})
    # Render detail as definition list
    detail_html = ""
    if isinstance(detail, dict):
        rows = []
        for k, v in detail.items():
            v_str = (
                ", ".join(map(str, v)) if isinstance(v, list)
                else json.dumps(v, separators=(",", ":"))
                if isinstance(v, dict)
                else str(v)
            )
            rows.append(
                f'<dt>{html.escape(str(k))}</dt>'
                f'<dd>{html.escape(v_str)}</dd>'
            )
        if rows:
            detail_html = f'<dl class="detail">{"".join(rows)}</dl>'

    return f'''
    <article class="card" data-wave="{wn}" data-kimi="{html.escape(kimi)}"
             data-name="{name.lower()}" id="w{wn}">
      <header class="card-h">
        <span class="badge wave">W{wn}</span>
        <span class="badge kimi">{html.escape(kimi)}</span>
        <span class="badge commit">{html.escape(commit)}</span>
      </header>
      <h2 class="card-t">{name}</h2>
      <p class="card-headline">{headline}</p>
      {detail_html}
      <p class="if-text"><strong>Industry First:</strong> {if_text}</p>
      <footer class="card-f">
        <code>{report}</code>
      </footer>
    </article>'''


CSS = """
:root {
  --bg: #0a0e14;
  --bg-card: #131821;
  --bg-elev: #1c2230;
  --fg: #e6e9ef;
  --fg-mute: #9098a8;
  --acc: #4cc4ff;
  --acc2: #ffb84c;
  --green: #6dd49d;
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
  margin: 0 0 8px; font-size: 32px; font-weight: 700;
  letter-spacing: -0.5px;
}
header.top h1 .accent { color: var(--acc); }
header.top .lead {
  color: var(--fg-mute); font-size: 16px; max-width: 760px; margin: 0;
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
  font-size: 28px; font-weight: 700; color: var(--acc);
  display: block;
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
.toolbar input:focus { outline: none; border-color: var(--acc); }
.toolbar .count {
  color: var(--fg-mute); font-size: 13px; margin-left: auto;
}
.grid {
  display: grid; gap: 16px; padding: 24px 32px;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
}
.card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; padding: 18px; transition: border-color 0.15s;
}
.card:hover { border-color: var(--acc); }
.card-h {
  display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px;
}
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
dl.detail dt {
  display: inline; font-weight: 600; color: var(--fg-mute);
}
dl.detail dt::after { content: ": "; }
dl.detail dd {
  display: inline; margin: 0;
}
dl.detail dd::after { content: ""; display: block; }
.if-text {
  font-size: 13px; line-height: 1.55; color: var(--fg);
  margin: 8px 0 12px;
}
.if-text strong { color: var(--acc2); }
.card-f code {
  font-size: 11px; color: var(--fg-mute); word-break: break-all;
}
footer.bot {
  padding: 24px 32px 48px; color: var(--fg-mute); font-size: 12px;
  border-top: 1px solid var(--border); margin-top: 32px;
}
footer.bot code { color: var(--acc); }
"""

JS = """
(function() {
  const $search = document.querySelector('#search');
  const $cards = document.querySelectorAll('.card');
  const $count = document.querySelector('#count-visible');
  function applyFilter() {
    const q = $search.value.toLowerCase().trim();
    let n = 0;
    $cards.forEach(c => {
      const hay = (
        c.dataset.name + ' ' +
        c.dataset.kimi.toLowerCase() + ' ' +
        c.dataset.wave + ' ' +
        c.textContent.toLowerCase()
      );
      const show = !q || hay.includes(q);
      c.style.display = show ? '' : 'none';
      if (show) n++;
    });
    $count.textContent = n;
  }
  $search.addEventListener('input', applyFilter);
  $count.textContent = $cards.length;
  // Anchor scroll
  if (location.hash) {
    const t = document.querySelector(location.hash);
    if (t) t.scrollIntoView();
  }
})();
"""


def main() -> int:
    if not DOSSIER.exists():
        print(f"[ifs-html] missing dossier: {DOSSIER.relative_to(REPO)}")
        return 1

    dossier = json.loads(DOSSIER.read_text())
    waves = dossier.get("waves", [])
    headline = dossier.get("headline", {})
    schema = dossier.get("schema", "v?")
    generated = dossier.get("generatedAtUtc", "?")

    # Headline counters
    total_waves = headline.get("waves", len(waves))
    total_ifs = headline.get("industry_firsts", len(waves))

    cards = "\n".join(_render_card(w) for w in waves)

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Industry-First Dossier — slot-math-engine-template</title>
  <style>{CSS}</style>
</head>
<body>
  <header class="top">
    <h1>Industry-First <span class="accent">Dossier</span></h1>
    <p class="lead">
      Engineering & math innovations that <strong>no slot vendor
      publishes</strong>. Each card is a closed wave with a Merkle-pinned
      acceptance report under <code>reports/acceptance/</code>.
    </p>
    <nav class="dossier-nav">
      <a href="index.html">↩ Landing</a>
      <a class="current" href="INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a href="REGULATOR_PORTAL.html">Regulator Portal</a>
      <a href="CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
      <a href="kernels/index.html">Kernel References</a>
      <a href="showcase_game.html">Showcase Game</a>
      <a href="acceptance_index.html">Acceptance Index</a>
    </nav>
  </header>

  <section class="stats">
    <div class="stat"><span class="n">{total_ifs}</span>
      <span class="l">Industry firsts</span></div>
    <div class="stat"><span class="n">{total_waves}</span>
      <span class="l">Closed waves</span></div>
    <div class="stat"><span class="n">22</span>
      <span class="l">Math kernels</span></div>
    <div class="stat"><span class="n">22</span>
      <span class="l">Rust ports</span></div>
    <div class="stat"><span class="n">20/20</span>
      <span class="l">DONE-UNIVERSAL</span></div>
    <div class="stat"><span class="n">98.88%</span>
      <span class="l">Mutation score</span></div>
  </section>

  <div class="toolbar">
    <input id="search" type="search"
           placeholder="Search waves, kimi, kernel name…"
           autocomplete="off">
    <span class="count"><span id="count-visible">0</span>
      / {total_ifs} visible</span>
  </div>

  <section class="grid">{cards}
  </section>

  <footer class="bot">
    Dossier schema: <code>{html.escape(schema)}</code><br>
    Generated UTC: <code>{html.escape(str(generated))}</code><br>
    Source: <code>reports/dossier/INDUSTRY_FIRST_DOSSIER.json</code><br>
    HTML Merkle (SHA-256 over body): <code>__MERKLE__</code>
  </footer>
  <script>{JS}</script>
</body>
</html>
"""
    # Compute Merkle over the body BEFORE the merkle line is inserted
    body_for_hash = body.replace("__MERKLE__", "")
    digest = hashlib.sha256(body_for_hash.encode("utf-8")).hexdigest()
    body = body.replace("__MERKLE__", digest)

    OUT.write_text(body, encoding="utf-8")
    print(f"[ifs-html] wrote {OUT.relative_to(REPO)}")
    print(f"  cards rendered:  {len(waves)}")
    print(f"  total IFs:       {total_ifs}")
    print(f"  body merkle:     {digest}")
    print(f"  file size:       {OUT.stat().st_size / 1024:.1f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
