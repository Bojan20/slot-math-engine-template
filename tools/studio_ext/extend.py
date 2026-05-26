"""Mission #8 — Studio UI extensions implementation.

Three drop-in components for a W5.4 Studio scaffold:

1. **mc_worker.js**
   A WebWorker that runs Monte Carlo spin batches off the main thread.
   Consumes the same IR shape as `app.js`; reports `{spins, hits, rtp}`
   updates every `BATCH_SIZE` spins so the UI can render a live RTP
   curve without blocking input.

2. **paytable_heatmap.html / heatmap.js**
   Standalone page that renders the paytable as a 2-D heatmap:
   rows = symbols, cols = k-of-a-kind counts, cell color = pay × prob
   (RTP contribution). Reveals top-RTP entries at a glance and is the
   primary tool for game designers tuning a paytable.

3. **ir_editor.html / ir_editor.js**
   Side-by-side textarea + live closed-form RTP recalculation. Edits
   to reel weights / paytable / paylines re-run the closed-form
   Bernoulli RTP solver in the browser (port of `closed_form_line_rtp`
   from `tools.smt.rtp_synthesizer`).

The three components are pure HTML/JS (no build step, no
node_modules) so they drop straight into an existing Studio
scaffold or any static HTTP server. The `extend_studio()` helper
copies them into `<studio_root>/`.

Public API:
    from tools.studio_ext import extend_studio
    extend_studio(studio_dir, components=("mc", "heatmap", "editor"))
"""
from __future__ import annotations

from pathlib import Path
from typing import Iterable

EXT_COMPONENTS = ("mc", "heatmap", "editor")


# ─── Component 1: WebWorker MC harness ─────────────────────────────────────

_MC_WORKER_JS = r"""// Studio extension: WebWorker MC harness (Mission #8 W8.1)
//
// Loads the IR JSON, runs a Monte Carlo batch off the main thread, and
// posts incremental {spins, hits, rtp} updates back to the page. The
// main page can build a live RTP curve by subscribing to onmessage.
//
// Protocol:
//   page → worker:  { type: 'start', ir, spins, batch }
//                   { type: 'stop' }
//   worker → page:  { type: 'progress', spins, hits, rtp }
//                   { type: 'done', spins, hits, rtp }
//
// The spin loop is deliberately minimal — same Mulberry32 RNG and
// line-eval the Studio app.js uses, just isolated in a worker. Drop
// in any IR with `topology`, `reels.base`, `paytable`, `evaluation`.

let _stop = false;

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function spinGrid(rng, reels, rows) {
  const grid = [];
  for (const reel of reels) {
    const start = Math.floor(rng() * reel.length);
    const col = [];
    for (let r = 0; r < rows; r++) {
      col.push(reel[(start + r) % reel.length]);
    }
    grid.push(col);
  }
  return grid;
}

function evalLines(ir, grid) {
  const ev = ir.evaluation || {};
  const lines = ev.paylines || ev.lines || [];
  const minMatch = ev.min_match || 3;
  const paytable = ir.paytable || [];
  let pay = 0;
  for (const line of lines) {
    // Get the symbol sequence on this line
    const seq = line.map((row, col) => grid[col][row]);
    // Find anchor — first non-wild
    let anchor = seq[0];
    const wildIds = (ir.symbols || []).filter((s) => s.kind === "wild").map((s) => s.id);
    if (wildIds.includes(anchor)) {
      for (const s of seq.slice(1)) {
        if (!wildIds.includes(s)) { anchor = s; break; }
      }
    }
    // Run length from left
    let run = 0;
    for (const s of seq) {
      if (s === anchor || wildIds.includes(s)) run++;
      else break;
    }
    if (run < minMatch) continue;
    // Paytable lookup — combo entries with `scope=line`
    for (const entry of paytable) {
      if ((entry.scope || "line") !== "line") continue;
      const combo = entry.combo || [];
      if (!combo.length) continue;
      const first = combo[0];
      if (first !== anchor) continue;
      const cnt = combo.filter((c) => c === first).length;
      if (cnt === run) { pay += entry.pays || 0; break; }
    }
  }
  return pay;
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "stop") { _stop = true; return; }
  if (msg.type !== "start") return;
  _stop = false;
  const { ir, spins, batch = 1000, seed = 42 } = msg;
  const rng = mulberry32(seed);
  const reels = (ir.reels && ir.reels.base && ir.reels.base[0])
                 ? ir.reels.base[0].reels
                 : [];
  const rows = (ir.topology && ir.topology.rows) || 3;
  let totalPay = 0, hits = 0;
  for (let i = 0; i < spins; i++) {
    if (_stop) {
      self.postMessage({ type: "done", spins: i, hits, rtp: totalPay / Math.max(i, 1) });
      return;
    }
    const grid = spinGrid(rng, reels, rows);
    const pay = evalLines(ir, grid);
    if (pay > 0) { hits++; totalPay += pay; }
    if ((i + 1) % batch === 0) {
      self.postMessage({
        type: "progress",
        spins: i + 1,
        hits,
        rtp: totalPay / (i + 1),
      });
    }
  }
  self.postMessage({ type: "done", spins, hits, rtp: totalPay / Math.max(spins, 1) });
};
"""


def emit_mc_worker(studio_root: Path) -> Path:
    """Write `mc_worker.js` into the studio scaffold root.

    Returns the path of the emitted file.
    """
    studio_root.mkdir(parents=True, exist_ok=True)
    out = studio_root / "mc_worker.js"
    out.write_text(_MC_WORKER_JS)
    return out


# ─── Component 2: Paytable heatmap ─────────────────────────────────────────

_HEATMAP_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Paytable Heatmap — Studio Extension</title>
  <link rel="stylesheet" href="app.css" />
  <style>
    .heatmap-grid { display: grid; gap: 2px; padding: 8px;
                    background: #0e0e10; font: 11px monospace; }
    .heatmap-cell { padding: 4px 6px; text-align: right; color: #f0f0f0;
                    border-radius: 2px; }
    .heatmap-cell.head { background: #1a1a20; color: #888; }
    .heatmap-cell.row-head { background: #1a1a20; color: #888;
                              text-align: left; }
  </style>
</head>
<body>
  <header><h1>Paytable RTP Heatmap</h1></header>
  <main>
    <p>Cell color encodes <code>pay × P(k-of-X)</code> — bigger /
       darker means more RTP contribution. Hover for the raw values.</p>
    <div id="heatmap"></div>
  </main>
  <script type="module" src="heatmap.js"></script>
</body>
</html>
"""

_HEATMAP_JS = r"""// Studio extension: Paytable heatmap (Mission #8 W8.2)
//
// Reads the local IR JSON, builds a Bernoulli per-cell probability
// approximation per symbol, then renders a heatmap of
// `pay × P(k-of-X)` (RTP contribution per (symbol, k) cell). Coloring
// is a log-scale red-yellow ramp so the eye picks the top RTP cells
// fast.

const IR_URL = "./" + (location.pathname.split("/").pop().replace(".html", "") + ".ir.json")
                   .replace("paytable_heatmap.ir.json", "");

async function fetchIR() {
  // Heuristic: a Studio scaffold has exactly one `*.ir.json` next to
  // index.html. Try a few likely names.
  const candidates = [];
  const link = document.querySelector('link[rel="ir"]');
  if (link) candidates.push(link.href);
  const found = [];
  // Look for any *.ir.json declared in the page
  document.querySelectorAll("a, link").forEach((el) => {
    const href = el.getAttribute("href") || "";
    if (href.endsWith(".ir.json")) found.push(href);
  });
  for (const c of [...found, "./game.ir.json", "./ir.json"]) {
    try {
      const r = await fetch(c);
      if (r.ok) return await r.json();
    } catch (_) { /* try next */ }
  }
  // Last-ditch: glob via fetch on index.html and scrape `ir.json` link
  return null;
}

function bernoulliPerCell(ir) {
  // For each symbol, compute its share on the FIRST base reel as an
  // approximation. Engine MC remains source of truth.
  const reels = (ir.reels && ir.reels.base && ir.reels.base[0])
                 ? ir.reels.base[0].reels : [];
  const out = {};
  for (const sym of ir.symbols || []) {
    let total = 0, hits = 0;
    for (const reel of reels) {
      for (const cell of reel) {
        total++;
        if (cell === sym.id) hits++;
      }
    }
    out[sym.id] = total > 0 ? hits / total : 0;
  }
  return out;
}

function buildMatrix(ir) {
  const p = bernoulliPerCell(ir);
  const nReels = (ir.topology && ir.topology.reels) || 5;
  // Find max k from paytable
  let maxK = 3;
  const pt = {}; // {sym: {k: pay}}
  for (const e of ir.paytable || []) {
    if ((e.scope || "line") !== "line") continue;
    const combo = e.combo || [];
    if (!combo.length) continue;
    const first = combo[0];
    if (!first || first === "--") continue;
    const k = combo.filter((c) => c === first).length;
    pt[first] = pt[first] || {};
    pt[first][k] = e.pays || 0;
    if (k > maxK) maxK = k;
  }
  // Compute RTP contribution per (sym, k)
  const rtp = {};
  for (const sym of Object.keys(pt)) {
    const psym = p[sym] || 0;
    rtp[sym] = {};
    for (const k of Object.keys(pt[sym])) {
      const pay = pt[sym][k];
      const ki = parseInt(k, 10);
      // P(line k-of-sym) ≈ psym^k × (1-psym)  for k < nReels
      const prob = ki < nReels
                     ? Math.pow(psym, ki) * (1 - psym)
                     : Math.pow(psym, nReels);
      rtp[sym][k] = pay * prob;
    }
  }
  return { p, pt, rtp, maxK, nReels };
}

function ramp(v, vmax) {
  if (vmax <= 0) return "#222";
  const t = Math.min(1, Math.log10(1 + 9 * v / vmax));
  const r = Math.floor(40 + 200 * t);
  const g = Math.floor(40 + 80 * (1 - t));
  const b = Math.floor(40 + 30 * (1 - t));
  return `rgb(${r},${g},${b})`;
}

function render(ir) {
  const m = buildMatrix(ir);
  const ks = [];
  for (let k = 3; k <= m.maxK; k++) ks.push(k);
  const syms = Object.keys(m.pt);
  const root = document.getElementById("heatmap");
  root.style.gridTemplateColumns = `120px ${ks.map(() => "70px").join(" ")} 80px`;
  // Header row
  const head = ["sym"].concat(ks.map((k) => `${k}-OAK`)).concat(["sum"]);
  for (const h of head) {
    const cell = document.createElement("div");
    cell.className = "heatmap-cell head";
    cell.textContent = h;
    root.appendChild(cell);
  }
  // Find vmax for color ramp
  let vmax = 0;
  for (const s of syms) for (const k of ks) {
    const v = m.rtp[s][k] || 0;
    if (v > vmax) vmax = v;
  }
  // Body rows
  for (const sym of syms) {
    const rowHead = document.createElement("div");
    rowHead.className = "heatmap-cell row-head";
    rowHead.textContent = sym;
    root.appendChild(rowHead);
    let rowSum = 0;
    for (const k of ks) {
      const v = m.rtp[sym][k] || 0;
      const cell = document.createElement("div");
      cell.className = "heatmap-cell";
      cell.style.background = ramp(v, vmax);
      cell.textContent = v > 0 ? v.toExponential(2) : "—";
      cell.title = `pay=${m.pt[sym][k] || 0}, p=${(m.p[sym] || 0).toFixed(4)}`;
      root.appendChild(cell);
      rowSum += v;
    }
    const sumCell = document.createElement("div");
    sumCell.className = "heatmap-cell";
    sumCell.style.background = ramp(rowSum, vmax * 3);
    sumCell.textContent = rowSum.toExponential(2);
    sumCell.title = `Σ RTP contribution from ${sym}`;
    root.appendChild(sumCell);
  }
}

fetchIR().then((ir) => {
  if (!ir) {
    document.getElementById("heatmap").textContent =
      "Could not auto-load IR JSON. Place a *.ir.json next to this page.";
    return;
  }
  render(ir);
});
"""


def emit_paytable_heatmap(studio_root: Path) -> tuple[Path, Path]:
    """Write the heatmap page + module into the scaffold root.

    Returns (html_path, js_path).
    """
    studio_root.mkdir(parents=True, exist_ok=True)
    h = studio_root / "paytable_heatmap.html"
    j = studio_root / "heatmap.js"
    h.write_text(_HEATMAP_HTML)
    j.write_text(_HEATMAP_JS)
    return h, j


# ─── Component 3: IR editor ────────────────────────────────────────────────

_EDITOR_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>IR Editor — Studio Extension</title>
  <link rel="stylesheet" href="app.css" />
  <style>
    .editor-grid { display: grid; grid-template-columns: 1fr 1fr;
                   gap: 12px; padding: 8px; height: calc(100vh - 80px); }
    textarea#ir-input { width: 100%; height: 100%; font: 12px monospace;
                        background: #0e0e10; color: #c0c0c0;
                        border: 1px solid #333; padding: 8px; }
    .panel { padding: 8px; background: #0e0e10; border: 1px solid #333;
             font: 13px sans-serif; color: #f0f0f0; overflow-y: auto; }
    .stat-row { display: flex; justify-content: space-between;
                padding: 4px 0; border-bottom: 1px solid #222; }
    .stat-row span:last-child { font-family: monospace;
                                  color: #6cf; font-weight: 600; }
    .error { color: #f66; font-size: 12px; }
  </style>
</head>
<body>
  <header>
    <h1>IR Editor — Live closed-form RTP</h1>
    <p>Edit the IR JSON on the left; right panel re-runs the Bernoulli
       closed-form line-eval RTP solver on every change.</p>
  </header>
  <main class="editor-grid">
    <textarea id="ir-input" spellcheck="false"></textarea>
    <div class="panel" id="stats"></div>
  </main>
  <script type="module" src="ir_editor.js"></script>
</body>
</html>
"""

_EDITOR_JS = r"""// Studio extension: IR Editor with live RTP (Mission #8 W8.3)
//
// Port of `tools.smt.rtp_synthesizer.closed_form_line_rtp` to JS so a
// designer can hot-edit the IR JSON and see the closed-form line-eval
// RTP update in real time (debounced 250 ms).
//
// Notes:
//   • RTP returned is line-eval ONLY (no features, no FS, no H&W).
//     Engine MC remains the source of truth for total RTP.
//   • Bernoulli per-cell hit probability is approximated from the
//     first base reel set, identical to the heatmap component.

function bernoulli(ir) {
  const reels = (ir.reels && ir.reels.base && ir.reels.base[0])
                 ? ir.reels.base[0].reels : [];
  const out = {};
  for (const sym of ir.symbols || []) {
    let total = 0, hits = 0;
    for (const reel of reels) {
      for (const cell of reel) {
        total++;
        if (cell === sym.id) hits++;
      }
    }
    out[sym.id] = total > 0 ? hits / total : 0;
  }
  return out;
}

function closedFormLineRTP(ir) {
  const ev = ir.evaluation || {};
  const lines = ev.paylines || ev.lines || [];
  const nLines = lines.length;
  const nReels = (ir.topology && ir.topology.reels) || 5;
  const betLines = (ir.bet_table && ir.bet_table.lines) || nLines || 1;
  const p = bernoulli(ir);
  let rtp = 0;
  for (const e of ir.paytable || []) {
    if ((e.scope || "line") !== "line") continue;
    const combo = e.combo || [];
    if (!combo.length) continue;
    const first = combo[0];
    if (!first || first === "--") continue;
    const k = combo.filter((c) => c === first).length;
    const psym = p[first] || 0;
    if (psym <= 0) continue;
    const pLine = k < nReels ? Math.pow(psym, k) * (1 - psym)
                              : Math.pow(psym, nReels);
    rtp += nLines * (e.pays || 0) * pLine / Math.max(betLines, 1);
  }
  return rtp;
}

function summarize(ir) {
  const rtp = closedFormLineRTP(ir);
  const ts = (ir.meta && ir.meta.target_rtp) || (ir.meta && ir.meta.rtp) || null;
  const drift = ts ? Math.abs(rtp - ts) : null;
  return {
    rtp,
    target: ts,
    drift,
    n_symbols: (ir.symbols || []).length,
    n_features: (ir.features || []).length,
    n_paylines: ((ir.evaluation || {}).paylines || []).length,
    n_paytable: (ir.paytable || []).length,
    reels: ((ir.topology || {}).reels) || "?",
    rows: ((ir.topology || {}).rows) || "?",
  };
}

function render(stats, err) {
  const root = document.getElementById("stats");
  if (err) {
    root.innerHTML = `<div class="error">${err}</div>`;
    return;
  }
  const rows = [
    ["Topology", `${stats.reels}×${stats.rows} · ${stats.n_paylines} lines`],
    ["Symbols", String(stats.n_symbols)],
    ["Features", String(stats.n_features)],
    ["Paytable rows", String(stats.n_paytable)],
    ["Closed-form line RTP", stats.rtp.toFixed(6)],
  ];
  if (stats.target != null) {
    rows.push(["Target RTP (meta)", stats.target.toFixed(6)]);
    rows.push(["Drift", stats.drift.toExponential(2)]);
  }
  root.innerHTML = rows
    .map(([a, b]) => `<div class="stat-row"><span>${a}</span><span>${b}</span></div>`)
    .join("");
}

let timer = null;
function update() {
  const txt = document.getElementById("ir-input").value;
  try {
    const ir = JSON.parse(txt);
    render(summarize(ir));
  } catch (e) {
    render(null, `JSON error: ${e.message}`);
  }
}

async function init() {
  // Auto-load any *.ir.json sibling to this page
  let irText = "{}";
  for (const c of ["./game.ir.json", "./ir.json"]) {
    try {
      const r = await fetch(c);
      if (r.ok) { irText = await r.text(); break; }
    } catch (_) { /* try next */ }
  }
  // Or scrape from the DOM
  for (const a of document.querySelectorAll("a, link")) {
    const href = a.getAttribute("href") || "";
    if (href.endsWith(".ir.json")) {
      try {
        const r = await fetch(href);
        if (r.ok) { irText = await r.text(); break; }
      } catch (_) { /* try next */ }
    }
  }
  const ta = document.getElementById("ir-input");
  ta.value = irText;
  ta.addEventListener("input", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(update, 250);
  });
  update();
}

init();
"""


def emit_ir_editor(studio_root: Path) -> tuple[Path, Path]:
    """Write IR editor page + module into the scaffold root.

    Returns (html_path, js_path).
    """
    studio_root.mkdir(parents=True, exist_ok=True)
    h = studio_root / "ir_editor.html"
    j = studio_root / "ir_editor.js"
    h.write_text(_EDITOR_HTML)
    j.write_text(_EDITOR_JS)
    return h, j


# ─── Aggregate driver ──────────────────────────────────────────────────────


def extend_studio(
    studio_root: Path,
    components: Iterable[str] = EXT_COMPONENTS,
) -> dict[str, list[Path]]:
    """Drop Mission #8 extension components into an existing W5.4
    Studio scaffold root.

    `components` may include "mc", "heatmap", "editor".  Returns a
    dict mapping component → list of files written.
    """
    studio_root = Path(studio_root)
    studio_root.mkdir(parents=True, exist_ok=True)
    out: dict[str, list[Path]] = {}
    comps = set(components)
    if "mc" in comps:
        out["mc"] = [emit_mc_worker(studio_root)]
    if "heatmap" in comps:
        h, j = emit_paytable_heatmap(studio_root)
        out["heatmap"] = [h, j]
    if "editor" in comps:
        h, j = emit_ir_editor(studio_root)
        out["editor"] = [h, j]
    return out
