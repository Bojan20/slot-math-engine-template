#!/usr/bin/env python3
"""
Build a single-file HTML portfolio dashboard for ALL real-market released-game
PARs that have been ingested into the engine, plus the copyright-safe
`book-expanding-bonusbuy` template.

Inputs (per-game IR JSON files under `games/*/out/*.ir.json`):
  * Cash Eruption                  (IGT 200-1637-001/002/003)
  * Fort Knox Wolf Run            (IGT 200-1775-001/002)
  * Fortune Coin Boost Classic    (IGT 200-1581-001..004)
  * Skeleton Key                  (IGT 200-1517-001/002/003)
  * book-expanding-bonusbuy       (<<redacted>> template, 3 reference tiers)

Output:
  reports/dashboards/real-market-portfolio.html

The HTML is single-file, no external CSS/JS, file:// safe, ≤ 30 KB.
Drops straight into the operator-package ZIP.
"""
from __future__ import annotations

import glob
import html
import json
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "reports" / "dashboards" / "real-market-portfolio.html"
MANIFEST = REPO / "reports" / "dashboards" / "real-market-portfolio.manifest.json"
OUT.parent.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------------------
# IR collection
# ---------------------------------------------------------------------------
GAME_DESCRIPTIONS = {
    "cash-eruption": {
        "display": "Cash Eruption",
        "vendor": "IGT",
        "mechanic": "5×3 / 20 lines · Fireball Hold & Win · expanding Wild",
        "industry_anchor": "W4.x H&W (link-and-spin)",
    },
    "fort-knox-wolf-run": {
        "display": "Fort Knox Wolf Run",
        "vendor": "IGT",
        "mechanic": "4×5 lines · Pick Bonus · Linear Progressive",
        "industry_anchor": "W4.x Lines + Pick + Progressive",
    },
    "fortune-coin-boost-classic": {
        "display": "Fortune Coin Boost Classic",
        "vendor": "IGT",
        "mechanic": "3×5 / 243 ways · Coin Boost respin · Jackpot Bonus",
        "industry_anchor": "W4.x 243-Ways + Cash Respin",
    },
    "skeleton-key": {
        "display": "Skeleton Key",
        "vendor": "IGT",
        "mechanic": "Megaways (3×5 → 6×5, 243…7776 ways) · Mystery Transform",
        "industry_anchor": "W4.8 Megaways",
    },
    "book-expanding-bonusbuy": {
        "display": "Book-style Expanding + Bonus Buy (template)",
        "vendor": "<<redacted>>",
        "mechanic": "5×3 / 10 lines · Expanding Symbol FS · direct-buy Bonus Buy (100×)",
        "industry_anchor": "W4.11 / W4.15 (copyright-safe template)",
    },
    "megaways-clean-room-template": {
        "display": "Megaways clean-room template",
        "vendor": "<<redacted>>",
        "mechanic": "6 reels · 2…7 rows · 117 649 ways · cascading wins · FS multiplier",
        "industry_anchor": "W4.8 Megaways (copyright-safe template)",
    },
    "walking-wild-clean-room-template": {
        "display": "Walking Wild clean-room template",
        "vendor": "<<redacted>>",
        "mechanic": "5×3 / 20 lines · sticky walking Wild · FS retrigger",
        "industry_anchor": "W4.12 Walking Wild (copyright-safe template)",
    },
}

# Folders that should be tagged with the TEMPLATE badge (copyright-safe).
TEMPLATE_FOLDERS = frozenset(
    {
        "book-expanding-bonusbuy",
        "megaways-clean-room-template",
        "walking-wild-clean-room-template",
    }
)


def collect_ir_files() -> dict[str, list[dict]]:
    """Group IR files by game folder, sorted + de-duped by SWID.

    A single game can have multiple IR aliases on disk (e.g.
    `fort-knox-wolf-run.200-1775-001.slot-sim.ir.json` and
    `igt.200-1775-001.slot-sim.ir.json` are the same paymodel).
    We pick the entry whose filename starts with the game folder name,
    falling back to the first entry per SWID.
    """
    by_folder_swid: dict[tuple[str, str], list[tuple[str, dict]]] = defaultdict(list)
    for fp in sorted(glob.glob(str(REPO / "games" / "*" / "out" / "*.ir.json"))):
        folder = Path(fp).parts[-3]
        if folder == "ce-copy-test":
            continue
        try:
            d = json.loads(Path(fp).read_text())
        except json.JSONDecodeError:
            continue
        meta = d.get("meta", {})
        breakdown = meta.get("rtp_breakdown") or meta.get("rtp_breakdown_reference") or {}
        swid = meta.get("swid") or Path(fp).stem  # templates fall back to filename
        entry = {
            "file": Path(fp).name,
            "rel_path": str(Path(fp).relative_to(REPO)),
            "name": meta.get("name"),
            "vendor": meta.get("vendor"),
            "swid": swid,
            "family": meta.get("family"),
            "topology": d.get("topology", {}),
            "rtp_total": meta.get("rtp_total") or breakdown.get("total_normal"),
            "rtp_breakdown": breakdown,
            "hit_frequency": meta.get("hit_frequency") or meta.get("hit_frequency_reference"),
            "win_frequency": meta.get("win_frequency") or meta.get("win_frequency_reference"),
        }
        by_folder_swid[(folder, swid)].append((Path(fp).name, entry))

    grouped: dict[str, list[dict]] = defaultdict(list)
    for (folder, _swid), candidates in by_folder_swid.items():
        # Prefer filename starting with folder name + `.slot-sim`.
        preferred = next(
            (e for name, e in candidates
             if name.startswith(folder) and name.endswith(".slot-sim.ir.json")),
            None,
        )
        if preferred is None:
            preferred = next(
                (e for name, e in candidates if name.endswith(".slot-sim.ir.json")),
                candidates[0][1],
            )
        grouped[folder].append(preferred)
    # Sort each folder's entries by SWID.
    for folder in grouped:
        grouped[folder].sort(key=lambda e: e.get("swid") or "")
    return grouped


# ---------------------------------------------------------------------------
# HTML render
# ---------------------------------------------------------------------------
HTML_HEAD = """<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Real-Market Released-Game Portfolio</title>
<style>
  :root {
    --bg:#0b1018; --panel:#151c2b; --line:#28324b; --text:#d8e0ff;
    --muted:#7c8ab2; --accent:#66d9ff; --pass:#5dd39e; --warn:#ffd166;
  }
  html,body { background:var(--bg); color:var(--text); font:14px/1.45 ui-monospace,Menlo,monospace; margin:0; }
  .wrap { max-width:1180px; margin:0 auto; padding:24px 18px 64px; }
  h1 { font-size:22px; margin:0 0 4px; color:var(--accent); letter-spacing:-0.01em; }
  h2 { font-size:16px; margin:28px 0 10px; color:var(--text); border-bottom:1px solid var(--line); padding-bottom:6px; }
  .sub { color:var(--muted); font-size:12px; margin:0 0 16px; }
  .panel { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px 18px; margin:10px 0; }
  table { width:100%; border-collapse:collapse; margin:6px 0; }
  th,td { text-align:left; padding:6px 8px; border-bottom:1px solid var(--line); font-size:13px; }
  th { font-weight:600; color:var(--accent); font-size:11px; text-transform:uppercase; letter-spacing:0.06em; }
  td.num { text-align:right; font-variant-numeric:tabular-nums; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; background:rgba(93,211,158,.15); color:var(--pass); border:1px solid var(--pass); }
  .badge.template { background:rgba(255,209,102,.15); color:var(--warn); border-color:var(--warn); }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:12px; }
  .kpi { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:14px; }
  .kpi .label { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.08em; }
  .kpi .value { font-size:22px; color:var(--text); margin:4px 0; font-variant-numeric:tabular-nums; }
  .kpi .delta { font-size:11px; color:var(--muted); }
  .game { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px 18px; margin:12px 0; }
  .game h3 { color:var(--accent); font-size:15px; margin:0 0 2px; }
  .game .mech { color:var(--muted); font-size:12px; margin:0 0 12px; }
  code { background:var(--bg); padding:1px 6px; border-radius:4px; border:1px solid var(--line); font-size:12px; }
  .footer { color:var(--muted); font-size:11px; margin-top:24px; padding-top:12px; border-top:1px solid var(--line); }
</style>
</head><body><div class="wrap">"""

HTML_FOOT = """<div class="footer">
  Built locally by <code>tools/build_real_market_portfolio.py</code> · source XLSX files (<code>games/*/raw/*.xlsx</code>) stay local, gitignored · IR + reports ship · copyright posture: vendor / game / SWID identifiers either explicit (vendor PARs) or generic (template).
</div></div></body></html>"""


def fmt_pct(x) -> str:
    if x is None:
        return "—"
    return f"{x * 100:.2f}%"


def render_kpi(label: str, value: str, delta: str = "") -> str:
    delta_html = f'<div class="delta">{html.escape(delta)}</div>' if delta else ""
    return f'''<div class="kpi">
      <div class="label">{html.escape(label)}</div>
      <div class="value">{html.escape(value)}</div>
      {delta_html}
    </div>'''


def render_game(folder: str, entries: list[dict]) -> str:
    desc = GAME_DESCRIPTIONS.get(folder, {})
    title = desc.get("display", folder)
    vendor = desc.get("vendor", "?")
    mech = desc.get("mechanic", "?")
    anchor = desc.get("industry_anchor", "")
    is_template = folder in TEMPLATE_FOLDERS
    badge = '<span class="badge template">TEMPLATE</span>' if is_template else '<span class="badge">REAL-MARKET</span>'

    rows = []
    for e in entries:
        topo = e.get("topology") or {}
        topo_str = (
            f"{topo.get('reels', '?')}×{topo.get('rows', topo.get('rows_max', topo.get('rows_min', '?')))}"
            if topo
            else "?"
        )
        if topo.get("kind") == "megaways":
            topo_str = f"Megaways {topo.get('reels','?')}×{topo.get('rows_min','?')}…{topo.get('rows_max','?')}"
        breakdown = e.get("rtp_breakdown") or {}
        feat_share = []
        for k, v in breakdown.items():
            if k in ("total", "total_normal", "base_game", "line_pay", "scatter_pay"):
                continue
            if isinstance(v, (int, float)) and 0 <= v <= 1:
                feat_share.append(f"{k}={fmt_pct(v)}")
        feat = " · ".join(feat_share[:3]) if feat_share else "—"
        rows.append(
            f"<tr>"
            f"<td><code>{html.escape(str(e.get('swid') or '—'))}</code></td>"
            f"<td>{html.escape(str(e.get('family') or '—'))}</td>"
            f"<td>{html.escape(topo_str)}</td>"
            f"<td class='num'>{fmt_pct(e.get('rtp_total'))}</td>"
            f"<td class='num'>{fmt_pct(e.get('hit_frequency'))}</td>"
            f"<td class='num'>{fmt_pct(e.get('win_frequency'))}</td>"
            f"<td>{html.escape(feat)}</td>"
            f"</tr>"
        )

    body = (
        '<table><thead><tr>'
        '<th>SWID</th><th>Family</th><th>Topology</th>'
        '<th class="num">RTP</th><th class="num">Hit freq</th><th class="num">Win freq</th>'
        '<th>Feature shares (top 3)</th>'
        '</tr></thead><tbody>' + ''.join(rows) + '</tbody></table>'
    )

    return f'''<div class="game">
      <h3>{html.escape(title)} <span style="float:right">{badge}</span></h3>
      <p class="mech"><strong>{html.escape(vendor)}</strong> · {html.escape(mech)} · <em>{html.escape(anchor)}</em></p>
      {body}
    </div>'''


def render_dashboard(grouped: dict[str, list[dict]]) -> str:
    # KPIs
    total_games = len(grouped)
    total_swids = sum(len(v) for v in grouped.values())
    mechanic_families = set()
    for game, entries in grouped.items():
        for e in entries:
            if e.get("family"):
                mechanic_families.add(e["family"])
    # The IR-side "family" is a coarse bucket; the GAME_DESCRIPTIONS anchor
    # gives the actual industry mechanic label. Count anchors.
    industry_anchors = set()
    for game in grouped:
        anchor = GAME_DESCRIPTIONS.get(game, {}).get("industry_anchor")
        if anchor:
            industry_anchors.add(anchor)

    rtp_values: list[float] = []
    for entries in grouped.values():
        for e in entries:
            v = e.get("rtp_total")
            if isinstance(v, (int, float)) and 0 < v < 1.5:
                rtp_values.append(v)
    if rtp_values:
        rtp_min = min(rtp_values)
        rtp_max = max(rtp_values)
        rtp_avg = sum(rtp_values) / len(rtp_values)
    else:
        rtp_min = rtp_max = rtp_avg = 0

    kpis = (
        '<div class="grid">' +
        render_kpi("Source games", str(total_games), "real-market + 1 template") +
        render_kpi("SWIDs ingested", str(total_swids), "vendor-coded paymodels") +
        render_kpi("Mechanic anchors", str(len(industry_anchors)), "industry-first slots") +
        render_kpi(
            "RTP range",
            f"{rtp_min * 100:.2f}–{rtp_max * 100:.2f}%",
            f"avg {rtp_avg * 100:.2f}%",
        ) +
        '</div>'
    )

    title = '<h1>Real-Market Released-Game Portfolio</h1>'
    sub = (
        '<p class="sub">Every IR ingested by the engine. Source XLSX files stay local '
        '(<code>games/*/raw/*.xlsx</code> — gitignored); only the math primitives + '
        'simulation reports ship. Click an entry\'s SWID to find the matching IR JSON in '
        '<code>games/&lt;name&gt;/out/&lt;swid&gt;.slot-sim.ir.json</code>.</p>'
    )

    games_html = []
    for folder in sorted(grouped.keys()):
        games_html.append(render_game(folder, grouped[folder]))

    return HTML_HEAD + title + sub + kpis + ''.join(games_html) + HTML_FOOT


def main() -> None:
    grouped = collect_ir_files()
    html_doc = render_dashboard(grouped)
    OUT.write_text(html_doc)
    size_kb = OUT.stat().st_size / 1024

    total_swids = sum(len(v) for v in grouped.values())
    anchors = sorted({
        GAME_DESCRIPTIONS.get(g, {}).get("industry_anchor", "")
        for g in grouped
    } - {""})
    manifest = {
        "bundle_url": str(OUT.relative_to(REPO)),
        "size_bytes": OUT.stat().st_size,
        "size_kb": round(size_kb, 2),
        "offline_safe": True,
        "games": sorted(grouped.keys()),
        "total_swids": total_swids,
        "industry_anchors": anchors,
        "per_game_counts": {g: len(v) for g, v in grouped.items()},
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(f"[portfolio] wrote {OUT.relative_to(REPO)} ({size_kb:.1f} KB)")
    print(f"[portfolio] wrote {MANIFEST.relative_to(REPO)}")
    print(f"[portfolio] games={len(grouped)}  swids={total_swids}  anchors={len(anchors)}")


if __name__ == "__main__":
    main()
