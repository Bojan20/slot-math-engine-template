#!/usr/bin/env python3
"""
Build the single-file operator-portal landing page.

Indexes every shippable HTML dashboard + key cert reports into a single
nav surface so an operator / regulator can find the parity proofs, the
live PAR compiler, the unified audit, and the portfolio in one click.

Output:
  reports/dashboards/index.html   — operator portal (offline, file:// safe)

The page is self-contained, no JS / CSS deps. All linked dashboards are
relative — they must live in the same directory.
"""
from __future__ import annotations

import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
DASH_DIR = REPO / "reports" / "dashboards"
OUT = DASH_DIR / "index.html"
MANIFEST = DASH_DIR / "index.manifest.json"

DASH_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------
ENTRIES = [
    {
        "id": "mc-parity",
        "name": "MC Parity Dashboard",
        "href": "mc-parity-dashboard.html",
        "summary": (
            "Closed-form + Monte Carlo parity against the real-market released-game PAR "
            "(book-expanding-bonusbuy template). KPI strip + PAR-vs-CF-vs-MC table + gate matrix."
        ),
        "wave": "W4.11c",
        "category": "parity",
    },
    {
        "id": "real-market-portfolio",
        "name": "Real-Market Portfolio",
        "href": "real-market-portfolio.html",
        "summary": (
            "Every real-market released-game PAR ingested by the engine (5 games, 13 SWIDs, 5 "
            "mechanic anchors). Per-game cards expose family, topology, RTP, hit/win freq, feature shares."
        ),
        "wave": "W4.11d",
        "category": "portfolio",
    },
    {
        "id": "unified-audit",
        "name": "Unified Audit Pipeline",
        "href": "unified-audit.html",
        "summary": (
            "W7.11 composability — all 8 W7.x kernels run in one call + emit a single SHA-256 "
            "consolidated_hash committing to every sub-manifest (gdd / asset / derivative / pareto / RL / mesh / JS)."
        ),
        "wave": "W7.11",
        "category": "audit",
    },
    {
        "id": "live-par-compiler",
        "name": "Live PAR Compiler (browser)",
        "href": "live-par-compiler.html",
        "summary": (
            "Designer DSL → RTP in real-time in the browser. 4 KB vanilla JS bundle, SHA-256 pinned, "
            "Node-verified parity vs Rust + Python."
        ),
        "wave": "W7.7",
        "category": "compiler",
    },
    {
        "id": "par-verification",
        "name": "PAR Verification Dashboard",
        "href": "par-verification.html",
        "summary": (
            "Per-SWID drill-down for ingested vendor PARs — paytable / reel-weight / payline / "
            "cell-provenance commitment surfaces."
        ),
        "wave": "PAR-001",
        "category": "verification",
    },
]


REPORTS_INDEX = [
    {
        "label": "Industry-First Dossier (JSON)",
        "href": "../../reports/dossier/INDUSTRY_FIRST_DOSSIER.json",
    },
    {
        "label": "Industry-First Dossier (Markdown)",
        "href": "../../reports/dossier/INDUSTRY_FIRST_DOSSIER.md",
    },
    {
        "label": "Closed-Form Portfolio",
        "href": "../../reports/dossier/CLOSED_FORM_PORTFOLIO.md",
    },
    {
        "label": "Performance Benchmark",
        "href": "../../reports/acceptance/PERF_BENCH.json",
    },
    {
        "label": "Book-BonusBuy Closed-Form Parity",
        "href": "../../reports/acceptance/book_bonusbuy_parity.json",
    },
    {
        "label": "Book-BonusBuy MC Parity",
        "href": "../../reports/acceptance/book_bonusbuy_mc.json",
    },
    {
        "label": "Unified Audit (consolidated SHA-256)",
        "href": "../../reports/acceptance/UNIFIED_AUDIT.json",
    },
]


# ---------------------------------------------------------------------------
# HTML render
# ---------------------------------------------------------------------------
HTML_HEAD = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Slot Math Engine · Operator Portal</title>
<style>
  :root {
    --bg:#0b1018; --panel:#151c2b; --line:#28324b; --text:#d8e0ff;
    --muted:#7c8ab2; --accent:#66d9ff; --pass:#5dd39e;
  }
  html,body { background:var(--bg); color:var(--text); font:14px/1.45 ui-monospace,Menlo,monospace; margin:0; }
  .wrap { max-width:1100px; margin:0 auto; padding:32px 18px 64px; }
  h1 { font-size:24px; margin:0 0 4px; color:var(--accent); letter-spacing:-0.01em; }
  h2 { font-size:16px; margin:32px 0 12px; color:var(--text); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .sub { color:var(--muted); font-size:12px; margin:0 0 16px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:14px; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:18px 20px; transition:border-color .15s; }
  .card:hover { border-color:var(--accent); }
  .card a { color:var(--accent); text-decoration:none; font-size:16px; font-weight:600; }
  .card a:hover { text-decoration:underline; }
  .card .wave { display:inline-block; font-size:10px; color:var(--muted); border:1px solid var(--line); padding:1px 6px; border-radius:999px; margin-left:8px; vertical-align:middle; letter-spacing:0.06em; }
  .card .sum { color:var(--text); font-size:12.5px; margin:8px 0 0; line-height:1.5; }
  .reports { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 18px; }
  .reports ul { margin:0; padding-left:18px; }
  .reports li { margin:6px 0; font-size:13px; }
  .reports a { color:var(--accent); text-decoration:none; }
  .reports a:hover { text-decoration:underline; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(93,211,158,.15); color:var(--pass); border:1px solid var(--pass); }
  .footer { color:var(--muted); font-size:11px; margin-top:28px; padding-top:12px; border-top:1px solid var(--line); }
  code { background:var(--bg); padding:1px 6px; border-radius:4px; border:1px solid var(--line); font-size:12px; }
</style>
</head><body><div class="wrap">"""

HTML_FOOT = """<div class="footer">
  Built locally by <code>tools/build_operator_portal.py</code> · all linked dashboards are file:// safe ·
  source XLSX files (<code>games/*/raw/*.xlsx</code>) never ship · vendor / game / SWID identifiers preserved
  for real-market PARs and stripped for the template.
</div></div></body></html>"""


def render_card(entry: dict) -> str:
    return (
        f'<div class="card">'
        f'<a href="{html.escape(entry["href"])}">{html.escape(entry["name"])}</a>'
        f'<span class="wave">{html.escape(entry["wave"])}</span>'
        f'<p class="sum">{html.escape(entry["summary"])}</p>'
        f'</div>'
    )


def render_dashboard() -> str:
    title = '<h1>Slot Math Engine · Operator Portal</h1>'
    badge = '<p class="sub"><span class="badge">100 % offline</span> &nbsp; file:// safe · no remote URLs · no JS deps · drops into the operator-package ZIP</p>'

    intro = (
        '<p class="sub">Single landing surface that indexes every shippable dashboard + cert report. '
        'Click any card to open the matching offline HTML, or follow the report links for the underlying '
        'JSON / Markdown evidence.</p>'
    )

    dashboards = '<h2>Dashboards</h2><div class="grid">' + ''.join(render_card(e) for e in ENTRIES) + '</div>'

    reports = '<h2>Top reports</h2><div class="reports"><ul>'
    for r in REPORTS_INDEX:
        reports += f'<li><a href="{html.escape(r["href"])}">{html.escape(r["label"])}</a></li>'
    reports += '</ul></div>'

    return HTML_HEAD + title + badge + intro + dashboards + reports + HTML_FOOT


def main() -> None:
    html_doc = render_dashboard()
    OUT.write_text(html_doc)
    size_kb = OUT.stat().st_size / 1024
    manifest = {
        "bundle_url": str(OUT.relative_to(REPO)),
        "size_bytes": OUT.stat().st_size,
        "size_kb": round(size_kb, 2),
        "offline_safe": True,
        "dashboards": [{"id": e["id"], "name": e["name"], "wave": e["wave"], "href": e["href"]} for e in ENTRIES],
        "report_count": len(REPORTS_INDEX),
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"[operator-portal] wrote {OUT.relative_to(REPO)} ({size_kb:.1f} KB)")
    print(f"[operator-portal] wrote {MANIFEST.relative_to(REPO)}")
    print(f"[operator-portal] dashboards={len(ENTRIES)} reports={len(REPORTS_INDEX)}")


if __name__ == "__main__":
    main()
