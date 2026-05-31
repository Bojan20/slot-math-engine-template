"""SLOT-MATH Faza 4.1 + 4.2 — Web playable shell + IR bindings.

Generates a self-contained static bundle (HTML + JS) bound to game.ir.json.
Production runtime calls engine_api.spin() per click; this scaffold uses
the existing `web/studio/public/runner/runtime.js` shell pattern.

For Faza 4 we ship the **scaffolded** shell (deterministic, no animations).
Faza 6 (A6.4 WebGPU) or Faza 7 (custom Pixi skin) replace with full Pixi
production assets while keeping math byte-identical.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any


HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{game_name} — {variant_id}</title>
  <style>
    body {{ margin: 0; background: #0a0a0a; color: #e0e0e0; font-family: ui-monospace, monospace; }}
    #app {{ max-width: 960px; margin: 0 auto; padding: 24px; }}
    h1 {{ color: #00d4ff; margin: 0 0 8px; }}
    .meta {{ color: #888; font-size: 12px; margin-bottom: 24px; }}
    .reel-grid {{ display: grid; grid-template-columns: repeat({reels}, 1fr); gap: 4px; background: #1a1a1a; padding: 12px; border-radius: 8px; }}
    .cell {{ aspect-ratio: 1; display: flex; align-items: center; justify-content: center; background: #2a2a2a; font-size: 24px; font-weight: bold; border-radius: 4px; }}
    button {{ margin-top: 16px; padding: 12px 32px; font-size: 16px; background: #00d4ff; color: #000; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; }}
    .hud {{ margin-top: 16px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; font-size: 14px; }}
    .hud-item {{ background: #1a1a1a; padding: 8px 12px; border-radius: 4px; }}
    .hud-label {{ color: #888; font-size: 11px; text-transform: uppercase; }}
    .hud-value {{ color: #00d4ff; font-weight: bold; font-size: 18px; }}
    #math-mode {{ display: none; margin-top: 16px; padding: 12px; background: #1a1a1a; border: 1px solid #00d4ff; border-radius: 4px; }}
    #math-mode.active {{ display: block; }}
    .math-row {{ display: flex; justify-content: space-between; margin: 4px 0; font-size: 13px; }}
    .math-pass {{ color: #00ff88; }}
    .math-fail {{ color: #ff4444; }}
    .footer {{ margin-top: 32px; color: #444; font-size: 11px; text-align: center; }}
  </style>
</head>
<body>
  <div id="app">
    <h1>{game_name}</h1>
    <div class="meta">variant <code>{variant_id}</code> · RTP <code>{rtp_pct}%</code> · {jurisdictions} · merkle <code>{par_merkle_short}</code></div>

    <div class="reel-grid" id="reels"></div>

    <div class="hud">
      <div class="hud-item"><div class="hud-label">Balance</div><div class="hud-value" id="balance">1000.00</div></div>
      <div class="hud-item"><div class="hud-label">Bet</div><div class="hud-value" id="bet">{base_bet}</div></div>
      <div class="hud-item"><div class="hud-label">Last Win</div><div class="hud-value" id="last-win">0.00</div></div>
      <div class="hud-item"><div class="hud-label">Spins</div><div class="hud-value" id="spin-count">0</div></div>
    </div>

    <button id="spin">SPIN</button>
    <button id="math-toggle" style="background:#444;color:#e0e0e0;">Math Mode (Cmd+M)</button>

    <div id="math-mode">
      <div style="color:#00d4ff;font-weight:bold;margin-bottom:8px;">🔬 MATH MODE — Live auditor overlay</div>
      <div class="math-row"><span>Target RTP</span><span id="math-target-rtp">{rtp_pct}%</span></div>
      <div class="math-row"><span>Running RTP</span><span id="math-running-rtp">—</span></div>
      <div class="math-row"><span>Target hit-freq</span><span id="math-target-hf">{hit_freq_pct}%</span></div>
      <div class="math-row"><span>Running hit-freq</span><span id="math-running-hf">—</span></div>
      <div class="math-row"><span>Within Wilson CI (99%)</span><span id="math-ci-pass" class="math-pass">—</span></div>
      <div class="math-row"><span>Variance (rolling)</span><span id="math-variance">—</span></div>
      <div class="math-row"><span>Max win observed</span><span id="math-max-win">—</span></div>
      <div class="math-row"><span>Total spins</span><span id="math-total-spins">0</span></div>
    </div>

    <div class="footer">
      slot-math-engine-template · canonical-par/v1 · attestation pinned in deploy.signature.sha256<br/>
      <code>{ir_merkle_short}</code> (IR Merkle)
    </div>
  </div>
  <script src="bundle.js"></script>
</body>
</html>
"""


BUNDLE_JS_TEMPLATE = """\
/* slot-math production runtime — auto-emitted by tools/par_deploy/web_emit.py
   IR-driven deterministic spin loop. Math mode overlay (Cmd+M / Ctrl+M).
*/
(async function() {{
  const IR_PATH = './game.ir.json';
  const ir = await fetch(IR_PATH).then(r => r.json());

  // Reel grid render
  const reels = ir.topology.reels;
  const rows = ir.topology.rows || 3;
  const grid = document.getElementById('reels');
  const cells = [];
  for (let r = 0; r < reels; r++) {{
    for (let row = 0; row < rows; row++) {{
      const c = document.createElement('div');
      c.className = 'cell';
      c.textContent = '?';
      grid.appendChild(c);
      cells.push(c);
    }}
  }}

  // Reel strips → flat symbol pool per reel (weighted)
  const reelPools = ir.reels.base.map(reelMap => {{
    const pool = [];
    Object.entries(reelMap).forEach(([sym, w]) => {{
      for (let i = 0; i < Math.round(w * 10); i++) pool.push(sym);
    }});
    return pool;
  }});

  // Mulberry32 deterministic PRNG (seeded from IR.rng.default_seed)
  let seed = ir.rng.default_seed || 12345;
  function rng() {{
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }}

  // Math-mode running stats
  let totalSpins = 0;
  let totalPayout = 0;
  let totalHits = 0;
  let sumSq = 0;
  let maxWin = 0;

  const baseBet = ir.bet.base_bet || 1.0;
  let balance = 1000.0;

  function spin() {{
    let payout = 0;
    const drawn = [];
    for (let r = 0; r < reels; r++) {{
      const reelDraw = [];
      for (let row = 0; row < rows; row++) {{
        const pool = reelPools[r];
        const sym = pool[Math.floor(rng() * pool.length)];
        reelDraw.push(sym);
        cells[r * rows + row].textContent = sym;
      }}
      drawn.push(reelDraw);
    }}

    // Synthetic payout: count first-reel symbol on payline 0
    const firstSym = drawn[0][Math.floor(rows / 2)];
    let matchCount = 0;
    for (let r = 0; r < reels; r++) {{
      if (drawn[r].includes(firstSym)) matchCount++;
      else break;
    }}
    const paytable = ir.paytable[firstSym];
    if (paytable && paytable[String(matchCount)]) {{
      payout = paytable[String(matchCount)] * baseBet;
    }}

    balance += payout - baseBet;
    totalSpins++;
    totalPayout += payout;
    if (payout > 0) totalHits++;
    sumSq += payout * payout;
    if (payout > maxWin) maxWin = payout;

    document.getElementById('balance').textContent = balance.toFixed(2);
    document.getElementById('last-win').textContent = payout.toFixed(2);
    document.getElementById('spin-count').textContent = totalSpins;
    updateMathMode();
  }}

  function updateMathMode() {{
    if (!totalSpins) return;
    const runningRtp = totalPayout / (totalSpins * baseBet);
    const runningHf = totalHits / totalSpins;
    const ex = runningRtp * baseBet;
    const variance = sumSq / totalSpins - ex * ex;

    document.getElementById('math-running-rtp').textContent = (runningRtp * 100).toFixed(4) + '%';
    document.getElementById('math-running-hf').textContent = (runningHf * 100).toFixed(2) + '%';
    document.getElementById('math-variance').textContent = variance.toFixed(2);
    document.getElementById('math-max-win').textContent = maxWin.toFixed(2) + 'x';
    document.getElementById('math-total-spins').textContent = totalSpins;

    // Wilson CI gate (99%, z=2.5758)
    const z = 2.5758;
    const p = runningHf;
    const n = totalSpins;
    const denom = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / denom;
    const margin = (z / denom) * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
    const lower = centre - margin;
    const upper = centre + margin;
    const target = ir.limits.hit_freq_target;
    const inCi = lower <= target && target <= upper;
    const el = document.getElementById('math-ci-pass');
    el.textContent = inCi ? '✓ inside' : '✗ outside';
    el.className = inCi ? 'math-pass' : 'math-fail';
  }}

  document.getElementById('spin').addEventListener('click', spin);
  document.getElementById('math-toggle').addEventListener('click', () => {{
    document.getElementById('math-mode').classList.toggle('active');
  }});
  document.addEventListener('keydown', (e) => {{
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {{
      e.preventDefault();
      document.getElementById('math-mode').classList.toggle('active');
    }}
  }});
}})();
"""


def render_index_html(ir: dict[str, Any]) -> str:
    """Render scaffolded HTML for an IR."""
    meta = ir.get("meta", {})
    limits = ir.get("limits", {})
    bet = ir.get("bet", {})
    compliance = ir.get("compliance", {})
    provenance = ir.get("provenance", {})
    topology = ir.get("topology", {})

    return HTML_TEMPLATE.format(
        game_name=meta.get("name", "Unknown Game"),
        variant_id=provenance.get("par_source", "default").rsplit("/", 1)[-1].replace(".par.yaml", ""),
        rtp_pct=f"{limits.get('target_rtp', 0.96) * 100:.2f}",
        hit_freq_pct=f"{limits.get('hit_freq_target', 0.25) * 100:.2f}",
        jurisdictions=" / ".join(compliance.get("jurisdictions", ["GENERIC"])),
        par_merkle_short=(provenance.get("par_sha256", "")[:16] + "...") if provenance.get("par_sha256") else "n/a",
        ir_merkle_short=(provenance.get("ir_sha256", "")[:16] + "...") if provenance.get("ir_sha256") else "n/a",
        reels=topology.get("reels", topology.get("columns", 5)),
        base_bet=bet.get("base_bet", 1.0),
    )


def render_bundle_js() -> str:
    """Static JS bundle (no IR-specific templating)."""
    return BUNDLE_JS_TEMPLATE


def bundle_sha256(html: str, js: str, ir_bytes: bytes) -> str:
    """Combined sha256 over bundle artefakts (sorted by path)."""
    h = hashlib.sha256()
    h.update(b"index.html\n")
    h.update(html.encode("utf-8"))
    h.update(b"\nbundle.js\n")
    h.update(js.encode("utf-8"))
    h.update(b"\ngame.ir.json\n")
    h.update(ir_bytes)
    return h.hexdigest()


def emit_web_bundle(
    ir: dict[str, Any],
    out_dir: Path,
) -> dict[str, Any]:
    """Write web bundle to out_dir/web/. Returns bundle metadata."""
    web_dir = out_dir / "web"
    web_dir.mkdir(parents=True, exist_ok=True)

    html = render_index_html(ir)
    js = render_bundle_js()
    ir_bytes = json.dumps(ir, sort_keys=True, indent=2).encode("utf-8") + b"\n"

    (web_dir / "index.html").write_text(html, encoding="utf-8")
    (web_dir / "bundle.js").write_text(js, encoding="utf-8")
    (web_dir / "game.ir.json").write_bytes(ir_bytes)

    digest = bundle_sha256(html, js, ir_bytes)
    return {
        "out_dir": str(web_dir),
        "files": ["index.html", "bundle.js", "game.ir.json"],
        "bundle_sha256": digest,
        "bytes_total": len(html) + len(js) + len(ir_bytes),
    }
