#!/usr/bin/env python3
"""Build a portfolio MC parity dashboard across the 3 mech-library templates:

  * `template-book-bonusbuy` (W4.11 + W4.15) — real-market template
  * `template-megaways-cleanroom` (W4.8) — clean-room synthetic
  * `template-walking-wild-cleanroom` (W4.12) — clean-room synthetic

For each template the dashboard renders:
  * closed-form gate matrix (count + per-gate ✓/✗)
  * MC headline (rtp, fs trigger rate, key behavioral stats)
  * provenance: IR path + commit SHA hint

Self-contained HTML — zero CDN, file://-safe.
"""

from __future__ import annotations

import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "dashboards" / "clean-room-parity-portfolio.html"
OUT.parent.mkdir(parents=True, exist_ok=True)


# ─── Sources ────────────────────────────────────────────────────────


SOURCES = [
    {
        "id": "book-bonusbuy",
        "name": "Book Expanding + Bonus Buy",
        "waves": ["W4.11", "W4.15"],
        "kind": "real-market template (redacted)",
        "ir_path": "games/book-expanding-bonusbuy/out/template-book-bonusbuy.ir.json",
        "cf_report": "reports/acceptance/book_bonusbuy_parity.json",
        "mc_report": "reports/acceptance/book_bonusbuy_mc.json",
    },
    {
        "id": "megaways-cleanroom",
        "name": "Megaways Variable-Rows Ways",
        "waves": ["W4.8"],
        "kind": "clean-room (public-domain post 2023 patent expiry)",
        "ir_path": "games/megaways-clean-room-template/out/template-megaways-cleanroom.ir.json",
        "cf_report": "reports/acceptance/megaways_parity.json",
        "mc_report": "reports/acceptance/megaways_mc_parity.json",
    },
    {
        "id": "walking-wild-cleanroom",
        "name": "Sticky + Walking Wild",
        "waves": ["W4.12"],
        "kind": "clean-room (dual state-machine)",
        "ir_path": "games/walking-wild-clean-room-template/out/template-walking-wild-cleanroom.ir.json",
        "cf_report": "reports/acceptance/walking_wild_parity.json",
        "mc_report": "reports/acceptance/walking_wild_mc_parity.json",
    },
]


# ─── Helpers ────────────────────────────────────────────────────────


def load(path: str) -> dict | None:
    p = REPO / path
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return None


def badge(ok: bool) -> str:
    cls = "pass" if ok else "fail"
    text = "PASS" if ok else "FAIL"
    return f'<span class="badge {cls}">{text}</span>'


def fmt_num(v: float | None, digits: int = 4) -> str:
    if v is None:
        return "—"
    if isinstance(v, bool):
        return str(v)
    try:
        return f"{v:.{digits}f}"
    except (TypeError, ValueError):
        return str(v)


# ─── Per-source card ────────────────────────────────────────────────


def render_card(src: dict) -> str:
    cf = load(src["cf_report"])
    mc = load(src["mc_report"])

    cf_gates_html = ""
    cf_total = "—"
    if cf:
        cf_gates_count = f"{cf.get('gates_passed', 0)}/{cf.get('gates_total', 0)}"
        cf_total = cf_gates_count + (
            ' <span class="badge pass">CLEAN</span>'
            if cf.get("all_gates_pass") else
            ' <span class="badge fail">RED</span>'
        )
        gates = cf.get("gates", {})
        rows = "".join(
            f'<tr><td>{html.escape(name)}</td>'
            f'<td class="num">{badge(bool(ok))}</td></tr>'
            for name, ok in gates.items()
        )
        cf_gates_html = (
            f'<table><thead><tr><th>Gate</th><th class="num">Status</th></tr></thead>'
            f"<tbody>{rows}</tbody></table>"
        )

    mc_kpis = ""
    if mc:
        kpis: list[tuple[str, str]] = [
            ("n spins", f"{mc.get('n_spins', '—'):,}" if isinstance(mc.get("n_spins"), int) else "—"),
            ("gates", f"{mc.get('gates_passed', 0)}/{mc.get('gates_total', 0)}"),
        ]
        # Source-specific MC headline metrics.
        if "rtp_total" in mc:
            kpis.append(("rtp_total", fmt_num(mc["rtp_total"], 4)))
        if "rtp_base" in mc:
            kpis.append(("rtp_base", fmt_num(mc["rtp_base"], 4)))
        if "fs_trigger_rate" in mc:
            kpis.append(("FS trigger rate", fmt_num(mc["fs_trigger_rate"], 4)))
        if "wild_landing_rate" in mc:
            kpis.append(("wild landing/spin", fmt_num(mc["wild_landing_rate"], 3)))
        if "sticky_ttl_mean_observed" in mc:
            kpis.append((
                "E[TTL] obs / ref",
                f"{fmt_num(mc['sticky_ttl_mean_observed'], 2)} / {fmt_num(mc.get('e_ttl_reference'), 2)}",
            ))
        if "walking_distance_mean_observed" in mc:
            kpis.append((
                "E[dist] obs / E[steps] ref",
                f"{fmt_num(mc['walking_distance_mean_observed'], 2)} / {fmt_num(mc.get('e_steps_reference'), 2)}",
            ))
        if "fair_price_delta" in mc:
            kpis.append(("BB fair-price Δ", fmt_num(mc["fair_price_delta"], 6)))

        cells = "".join(
            f'<div class="kpi"><div class="label">{html.escape(label)}</div>'
            f'<div class="value">{html.escape(str(val))}</div></div>'
            for label, val in kpis
        )
        mc_kpis = f'<div class="grid">{cells}</div>'
    else:
        mc_kpis = '<p class="sub">MC report not present (run the validator first).</p>'

    waves_html = ", ".join(html.escape(w) for w in src["waves"])
    cf_fallback = '<p class="sub">closed-form report not present.</p>'
    cf_section = cf_gates_html or cf_fallback
    return (
        f'<section class="card">'
        f'<h2>{html.escape(src["name"])} <span class="waves">{waves_html}</span></h2>'
        f'<p class="sub">{html.escape(src["kind"])} · IR: <code>{html.escape(src["ir_path"])}</code></p>'
        f'<h3>Closed-form gates · {cf_total}</h3>'
        f'{cf_section}'
        f'<h3>Monte Carlo headline</h3>'
        f'{mc_kpis}'
        f'</section>'
    )


# ─── HTML shell ────────────────────────────────────────────────────


CSS = """
:root {
  --bg: #0b1018; --panel: #151c2b; --line: #28324b;
  --text: #d8e0ff; --muted: #7c8ab2; --accent: #66d9ff;
  --pass: #5dd39e; --fail: #ff7575;
}
html, body { background: var(--bg); color: var(--text); font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; margin: 0; padding: 0; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 24px 18px 64px; }
h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; color: var(--accent); }
h1 .sub { font-size: 14px; color: var(--muted); margin-left: 8px; font-weight: 400; }
h2 { font-size: 17px; margin: 0 0 4px; color: var(--text); }
h2 .waves { color: var(--accent); font-size: 12px; padding-left: 10px; }
h3 { font-size: 12px; margin: 16px 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; }
.sub { color: var(--muted); font-size: 12px; margin: 0 0 16px; }
.card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 18px 20px; margin: 14px 0; }
table { width: 100%; border-collapse: collapse; margin: 6px 0; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); }
th { font-weight: 600; color: var(--accent); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 700; }
.badge.pass { background: rgba(93, 211, 158, .15); color: var(--pass); border: 1px solid var(--pass); }
.badge.fail { background: rgba(255, 117, 117, .15); color: var(--fail); border: 1px solid var(--fail); }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
.kpi { background: rgba(11, 16, 24, .65); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
.kpi .label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
.kpi .value { font-size: 18px; color: var(--text); margin: 4px 0; font-variant-numeric: tabular-nums; }
code { background: rgba(102, 217, 255, .08); padding: 1px 6px; border-radius: 4px; color: var(--accent); }
footer { color: var(--muted); font-size: 11px; margin-top: 30px; text-align: center; }
"""


def render() -> str:
    cards = "\n".join(render_card(src) for src in SOURCES)
    body = (
        '<!doctype html><html lang="en"><head>'
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>Clean-Room Parity Portfolio · 3 mech-library templates</title>'
        f'<style>{CSS}</style></head><body>'
        '<div class="wrap">'
        '<h1>Clean-Room Parity Portfolio'
        '<span class="sub">3 mech-library templates · closed-form + MC validators</span></h1>'
        '<p class="sub">Offline · file://-safe · no CDN · no remote fonts.</p>'
        f'{cards}'
        '<footer>Generated by <code>tools/build_clean_room_parity_portfolio.py</code></footer>'
        '</div></body></html>'
    )
    return body


def main() -> int:
    OUT.write_text(render(), encoding="utf-8")
    size = OUT.stat().st_size
    sources_present = sum(
        1 for src in SOURCES
        if (REPO / src["cf_report"]).exists() and (REPO / src["mc_report"]).exists()
    )
    print(f"[parity-portfolio] wrote {OUT.relative_to(REPO)} ({size:,} B)")
    print(f"[parity-portfolio] templates with both cf+mc reports: {sources_present}/{len(SOURCES)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
