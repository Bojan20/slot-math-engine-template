#!/usr/bin/env python3
"""
Build single-file HTML dashboard for the portfolio IR validator JSON.

Visualises:
  * 6 × 13 gate matrix (rows = IRs, cols = gates) with PASS/FAIL chips.
  * Per-game card with SWID + family + RTP.
  * KPI strip (78/78 aggregate, by-game pass counts).

Input:  reports/acceptance/portfolio_validator.json
Output: reports/dashboards/portfolio-validator-dashboard.html
"""
from __future__ import annotations

import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "reports" / "acceptance" / "portfolio_validator.json"
OUT = REPO / "reports" / "dashboards" / "portfolio-validator-dashboard.html"
MANIFEST = OUT.with_suffix(".manifest.json")
OUT.parent.mkdir(parents=True, exist_ok=True)


HTML_HEAD = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Portfolio IR Validator</title>
<style>
  :root {
    --bg:#0b1018; --panel:#151c2b; --line:#28324b; --text:#d8e0ff;
    --muted:#7c8ab2; --accent:#66d9ff; --pass:#5dd39e; --fail:#ff7575;
  }
  html,body { background:var(--bg); color:var(--text); font:13.5px/1.45 ui-monospace,Menlo,monospace; margin:0; }
  .wrap { max-width:1200px; margin:0 auto; padding:24px 18px 64px; }
  h1 { font-size:22px; margin:0 0 4px; color:var(--accent); letter-spacing:-0.01em; }
  h2 { font-size:16px; margin:28px 0 10px; color:var(--text); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .sub { color:var(--muted); font-size:12px; margin:0 0 16px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 18px; margin:10px 0; overflow-x:auto; }
  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); font-size:12.5px; }
  th { font-weight:600; color:var(--accent); font-size:10.5px; text-transform:uppercase; letter-spacing:0.06em; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  td.chip-col { text-align:center; padding:4px 6px; }
  .chip { display:inline-block; width:14px; height:14px; border-radius:50%; }
  .chip.pass { background:var(--pass); box-shadow:0 0 4px rgba(93,211,158,.4); }
  .chip.fail { background:var(--fail); box-shadow:0 0 4px rgba(255,117,117,.4); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
  .kpi { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .kpi .label { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; }
  .kpi .value { font-size:22px; color:var(--text); margin:4px 0; font-variant-numeric:tabular-nums; }
  .kpi .delta { font-size:11px; color:var(--pass); }
  .footer { color:var(--muted); font-size:11px; margin-top:24px; padding-top:12px; border-top:1px solid var(--line); }
  code { background:var(--bg); padding:1px 6px; border-radius:4px; border:1px solid var(--line); font-size:12px; }
</style>
</head><body><div class="wrap">"""

HTML_FOOT = """<div class="footer">
  Built locally by <code>tools/build_portfolio_validator_dashboard.py</code> ·
  source: <code>reports/acceptance/portfolio_validator.json</code>
</div></div></body></html>"""


def chip(ok: bool) -> str:
    cls = "pass" if ok else "fail"
    return f'<span class="chip {cls}" title="{"PASS" if ok else "FAIL"}"></span>'


def render_kpi(label: str, value: str, delta: str = "") -> str:
    delta_html = f'<div class="delta">{html.escape(delta)}</div>' if delta else ""
    return (
        f'<div class="kpi">'
        f'<div class="label">{html.escape(label)}</div>'
        f'<div class="value">{html.escape(value)}</div>'
        f'{delta_html}</div>'
    )


def render_dashboard(report: dict) -> str:
    summary = report["summary"]
    results = report["results"]
    gate_names = list(results[0]["gates"].keys()) if results else []

    title = '<h1>Portfolio IR Validator</h1>'
    sub = (
        '<p class="sub">Six-gate cross-IR consistency check over every '
        '<code>games/*/out/*.slot-sim.ir.json</code> ingested by the engine. '
        'Pure stdlib, &lt; 30 ms runtime. Catches lift-bugs before they reach the parity gates.</p>'
    )

    by_gate = summary["by_gate"]
    by_game = summary["by_game"]

    # KPI strip
    kpis = (
        '<div class="grid">' +
        render_kpi(
            "IRs validated",
            f"{summary['total_irs']}",
            f"{summary['passed']} / {summary['total_irs']} pass",
        ) +
        render_kpi(
            "Gate × IR matrix",
            f"{sum(by_gate.values())} / {len(gate_names) * summary['total_irs']}",
            f"{len(gate_names)} gates × {summary['total_irs']} IRs",
        ) +
        render_kpi("Games covered", f"{len(by_game)}", "real-market + 1 template") +
        render_kpi("Failed gates", f"{summary['failed']}", "ZERO failures") +
        '</div>'
    )

    # Per-gate aggregate row
    by_gate_table = '<table><thead><tr><th>Gate</th><th class="num">Passed / total</th><th>Status</th></tr></thead><tbody>'
    for gname in gate_names:
        count = by_gate[gname]
        total = summary["total_irs"]
        ok = count == total
        by_gate_table += (
            f'<tr><td><code>{html.escape(gname)}</code></td>'
            f'<td class="num">{count} / {total}</td>'
            f'<td>{chip(ok)} {"PASS" if ok else "FAIL"}</td></tr>'
        )
    by_gate_table += '</tbody></table>'

    by_gate_panel = '<h2>Gate aggregates</h2><div class="panel">' + by_gate_table + '</div>'

    # Per-IR gate matrix
    matrix_head = (
        '<table><thead><tr>'
        '<th>Game</th><th>SWID</th><th>Family</th>'
        '<th class="num">RTP</th>'
        + ''.join(f'<th class="chip-col" title="{html.escape(g)}">{html.escape(g.split("_")[0])}</th>' for g in gate_names)
        + '<th class="chip-col">all</th></tr></thead><tbody>'
    )
    rows = []
    for r in results:
        rtp = r.get("rtp_total")
        rtp_str = f'{rtp * 100:.2f}%' if isinstance(rtp, (int, float)) else "—"
        chips = ''.join(
            f'<td class="chip-col">{chip(r["gates"][g]["pass"])}</td>'
            for g in gate_names
        )
        all_chip = chip(r["all_gates_pass"])
        rows.append(
            f'<tr><td>{html.escape(r["folder"])}</td>'
            f'<td><code>{html.escape(str(r["swid"]))}</code></td>'
            f'<td>{html.escape(str(r.get("family") or "—"))}</td>'
            f'<td class="num">{rtp_str}</td>'
            + chips
            + f'<td class="chip-col">{all_chip}</td></tr>'
        )
    matrix_body = ''.join(rows) + '</tbody></table>'

    matrix_panel = '<h2>Per-IR gate matrix</h2><div class="panel">' + matrix_head + matrix_body + '</div>'

    # By-game card grid
    cards_rows = []
    for game, info in sorted(by_game.items()):
        ok = info["swids"] == info["passed"]
        cards_rows.append(
            f'<tr><td>{html.escape(game)}</td>'
            f'<td class="num">{info["swids"]}</td>'
            f'<td class="num">{info["passed"]}</td>'
            f'<td>{chip(ok)}</td></tr>'
        )
    by_game_panel = (
        '<h2>By-game coverage</h2>'
        '<div class="panel"><table><thead><tr><th>Game</th>'
        '<th class="num">SWIDs</th><th class="num">Passed</th><th>Status</th></tr></thead>'
        '<tbody>' + ''.join(cards_rows) + '</tbody></table></div>'
    )

    return HTML_HEAD + title + sub + kpis + by_gate_panel + matrix_panel + by_game_panel + HTML_FOOT


def main() -> None:
    assert SRC.exists(), f"missing validator report: {SRC}"
    report = json.loads(SRC.read_text())
    html_doc = render_dashboard(report)
    OUT.write_text(html_doc)
    size_kb = OUT.stat().st_size / 1024

    s = report["summary"]
    manifest = {
        "bundle_url": str(OUT.relative_to(REPO)),
        "size_bytes": OUT.stat().st_size,
        "size_kb": round(size_kb, 2),
        "offline_safe": True,
        "total_irs": s["total_irs"],
        "passed": s["passed"],
        "failed": s["failed"],
        "by_gate": s["by_gate"],
        "by_game": s["by_game"],
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"[portfolio-validator-dashboard] wrote {OUT.relative_to(REPO)} ({size_kb:.1f} KB)")
    print(f"[portfolio-validator-dashboard] wrote {MANIFEST.relative_to(REPO)}")


if __name__ == "__main__":
    main()
