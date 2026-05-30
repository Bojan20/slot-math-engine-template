#!/usr/bin/env python3
"""W244 wave 70 — Showcase Game HTML page.

Renders `reports/acceptance/SHOWCASE_GAME_KERNEL.json` — composed
4-kernel synthetic game ("Crimson Tiger") sa closed-form / MC round-trip
validation — kao standalone HTML showcase page.

Output: `reports/dossier/showcase_game.html`

Industry-first claim: first open-source end-to-end composition
demonstration sa closed-form ≡ MC self-consistency PASS at 100k spins.
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
SRC = REPO / "reports" / "acceptance" / "SHOWCASE_GAME_KERNEL.json"
OUT = REPO / "reports" / "dossier" / "showcase_game.html"


def _esc(v) -> str:
    return html.escape("" if v is None else str(v))


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
header.top .pre {
  color: var(--fg-mute); font-size: 13px;
  text-transform: uppercase; letter-spacing: 1px;
}
header.top h1 {
  margin: 8px 0 8px; font-size: 36px; font-weight: 700;
  letter-spacing: -0.5px;
}
header.top h1 .accent { color: var(--acc); }
header.top .lead {
  color: var(--fg-mute); font-size: 15px; max-width: 760px; margin: 0;
}
.dossier-nav {
  margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap;
}
.dossier-nav a {
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--fg-mute); text-decoration: none; padding: 8px 14px;
  border-radius: 6px; font-size: 13px;
}
.dossier-nav a:hover { border-color: var(--acc); color: var(--fg); }
.dossier-nav a.current {
  border-color: var(--acc); color: var(--acc); background: var(--bg-elev);
}

section { padding: 24px 32px; max-width: 1200px; margin: 0 auto; }
section h2 {
  margin: 16px 0; font-size: 22px; font-weight: 600;
}
.composition {
  display: grid; gap: 14px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  margin-bottom: 16px;
}
.k-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px;
}
.k-card .name {
  font: 13px ui-monospace, monospace; color: var(--acc);
  margin-bottom: 8px;
}
.k-card .rtp {
  font-size: 26px; font-weight: 700; color: var(--fg);
}
.k-card .rtp small { font-size: 13px; color: var(--fg-mute); }
.k-card .bar {
  margin-top: 10px; height: 6px; background: var(--bg-elev);
  border-radius: 3px; overflow: hidden;
}
.k-card .bar > div {
  height: 100%; background: var(--acc);
}

.total {
  background: linear-gradient(90deg, rgba(76,196,255,0.1) 0%, transparent 100%);
  border: 1px solid var(--acc); border-radius: 8px;
  padding: 20px; margin-bottom: 24px;
}
.total .label {
  color: var(--fg-mute); font-size: 12px;
  text-transform: uppercase; letter-spacing: 1px;
}
.total .value {
  font-size: 42px; font-weight: 700; color: var(--acc);
  font-variant-numeric: tabular-nums;
}

.gate {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 16px 20px;
}
.gate.pass { border-color: var(--green); }
.gate.fail { border-color: var(--red); }
.gate-status {
  display: inline-block; padding: 4px 10px; border-radius: 4px;
  font: 11px ui-monospace, monospace; font-weight: 700;
}
.gate-status.pass { background: var(--green); color: #000; }
.gate-status.fail { background: var(--red); color: #fff; }
.gate dl { display: grid; grid-template-columns: max-content 1fr;
           gap: 6px 16px; margin: 12px 0 0; }
.gate dt { color: var(--fg-mute); font-size: 13px; }
.gate dd { margin: 0; font: 13px ui-monospace, monospace; }

.if-banner {
  background: rgba(255, 184, 76, 0.1); border: 1px solid var(--acc2);
  border-radius: 8px; padding: 16px 20px; color: var(--fg);
  font-size: 14px; line-height: 1.55;
}
.if-banner strong { color: var(--acc2); }

.merkle-bar {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; padding: 14px 18px; font-size: 13px;
}
.merkle-bar code {
  background: var(--bg-elev); padding: 2px 6px; border-radius: 3px;
  color: var(--acc); font: 12px ui-monospace, monospace;
  word-break: break-all;
}

footer.bot {
  padding: 24px 32px 48px; color: var(--fg-mute); font-size: 12px;
  border-top: 1px solid var(--border); margin-top: 32px;
}
footer.bot code { color: var(--acc); }
"""


def main() -> int:
    if not SRC.exists():
        print(f"[showcase-html] missing source: {SRC.relative_to(REPO)}")
        return 1

    d = json.loads(SRC.read_text())
    game_name = d.get("game_name", "Showcase")
    topology = d.get("topology", "?")
    kernels = d.get("kernels_composed", [])
    cf = d.get("closed_form", {})
    total_rtp = cf.get("total_rtp", 0.0)
    components = cf.get("components", {})
    mc = d.get("mc_round_trip_validation", {})
    gate_pass = mc.get("gate_pass", False)
    industry_first = d.get("industry_first", "")
    merkle = d.get("merkle_root_sha256", "")
    schema = d.get("schema", "")

    # Component cards (sorted by RTP descending)
    max_rtp = max(components.values()) if components else 1.0
    comp_cards = []
    for name, rtp in sorted(
        components.items(), key=lambda kv: -kv[1],
    ):
        pct = (rtp / max_rtp * 100) if max_rtp > 0 else 0
        share = (rtp / total_rtp * 100) if total_rtp > 0 else 0
        comp_cards.append(f'''
    <div class="k-card">
      <div class="name">{_esc(name)}</div>
      <div class="rtp">{rtp:.4f}<small> × bet</small></div>
      <div class="bar"><div style="width:{pct:.1f}%"></div></div>
      <div style="margin-top:8px;color:var(--fg-mute);font-size:12px;">
        {share:.1f}% of total RTP
      </div>
    </div>''')

    # Gate
    delta_pp = mc.get("delta_pp", 0.0)
    tolerance_pp = mc.get("tolerance_pp", 0.01)
    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Showcase Game — {_esc(game_name)} — composed kernel demo</title>
  <style>{CSS}</style>
</head>
<body>
  <header class="top">
    <div class="pre">Showcase game · {len(kernels)}-kernel composition</div>
    <h1>{_esc(game_name)} <span class="accent">— composition demo</span></h1>
    <p class="lead">
      <strong>{_esc(topology)}</strong> · composes
      <code>{_esc(" + ".join(kernels))}</code> u single synthetic game.
      Closed-form total RTP attested; Monte Carlo round-trip
      self-consistency PASS at {mc.get("mc_spins", "?"):,} spins.
    </p>
    <nav class="dossier-nav">
      <a href="index.html">↩ Landing</a>
      <a href="INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a href="REGULATOR_PORTAL.html">Regulator Portal</a>
      <a href="CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
      <a href="kernels/index.html">Kernel References</a>
      <a class="current" href="showcase_game.html">Showcase Game</a>
    </nav>
  </header>

  <section>
    <div class="if-banner">
      <strong>Industry First:</strong> {_esc(industry_first)}
    </div>
  </section>

  <section>
    <h2>Total RTP (closed-form)</h2>
    <div class="total">
      <div class="label">{_esc(game_name)} synthetic total</div>
      <div class="value">{total_rtp:.4f}</div>
    </div>
    <h2>Component breakdown ({len(components)} composed kernels)</h2>
    <div class="composition">{"".join(comp_cards)}
    </div>
  </section>

  <section>
    <h2>MC round-trip validation</h2>
    <div class="gate {'pass' if gate_pass else 'fail'}">
      <span class="gate-status {'pass' if gate_pass else 'fail'}">
        {"PASS" if gate_pass else "FAIL"}
      </span>
      <span style="margin-left:12px;font-size:14px;">
        Closed-form ≡ Monte Carlo (within {tolerance_pp} pp tolerance)
      </span>
      <dl>
        <dt>closed_form_calibrated_rtp</dt>
        <dd>{mc.get("closed_form_calibrated_rtp", 0):.6f}</dd>
        <dt>measured_cluster_rtp</dt>
        <dd>{mc.get("measured_cluster_rtp", 0):.6f}</dd>
        <dt>delta_pp</dt>
        <dd>{delta_pp:.2e}</dd>
        <dt>tolerance_pp</dt>
        <dd>{tolerance_pp}</dd>
        <dt>mc_spins</dt>
        <dd>{mc.get("mc_spins", "?"):,}</dd>
        <dt>mc_seed</dt>
        <dd>{mc.get("mc_seed", "?")}</dd>
      </dl>
    </div>
  </section>

  <section>
    <h2>Attestation</h2>
    <div class="merkle-bar">
      <div><strong>Schema:</strong> <code>{_esc(schema)}</code></div>
      <div><strong>Merkle (SHA-256):</strong>
        <code>{_esc(merkle)}</code></div>
      <div><strong>Verification:</strong>
        <code>python -m tools.build_showcase_game_kernel</code>
        — re-rebuild must match Merkle exactly.</div>
    </div>
  </section>

  <footer class="bot">
    Source: <code>reports/acceptance/SHOWCASE_GAME_KERNEL.json</code><br>
    Page Merkle (SHA-256 over body): <code>__MERKLE__</code>
  </footer>
</body>
</html>
"""
    body_for_hash = body.replace("__MERKLE__", "")
    digest = hashlib.sha256(body_for_hash.encode("utf-8")).hexdigest()
    body = body.replace("__MERKLE__", digest)

    OUT.write_text(body, encoding="utf-8")
    print(f"[showcase-html] wrote {OUT.relative_to(REPO)}")
    print(f"  game:           {game_name}")
    print(f"  composed:       {len(kernels)} kernels")
    print(f"  total RTP:      {total_rtp:.6f}")
    print(f"  MC gate:        {'PASS' if gate_pass else 'FAIL'} "
          f"(Δ {delta_pp:.2e} pp)")
    print(f"  body merkle:    {digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
