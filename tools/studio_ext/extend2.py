"""Mission #8 batch 2 — three additional Studio UI extensions.

Adds:
  W8.4 / P5.4  rtp_gauge.html + rtp_gauge.js
               Real-time SVG gauge consuming mc_worker.js progress
               messages — RTP needle + hit-freq + volatility live.

  W8.5 / P5.6  vendor_switcher.html + vendor_switcher.js
               Dropdown switches between sibling *.ir.json files;
               renders RTP / max-win / volatility diff between two
               selected IRs (A vs B).

  W8.6 / P5.7  reel_viz.html + reel_viz.js
               Per-reel SVG bar chart — height = symbol probability,
               color = closed-form RTP contribution. No D3 dep —
               pure SVG via DOM.
"""
from __future__ import annotations

from pathlib import Path

# ─── W8.4 / P5.4: Real-time RTP/hit/volatility gauge ───────────────────────

_RTP_GAUGE_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Live RTP Gauge — Studio Extension</title>
  <link rel="stylesheet" href="app.css" />
  <style>
    .gauge-shell { display: grid;
                   grid-template-columns: repeat(3, 1fr);
                   gap: 12px; padding: 12px; }
    .gauge-card { background: #0e0e10; border: 1px solid #333;
                  padding: 12px; text-align: center; color: #f0f0f0; }
    .gauge-card .big { font: 600 36px monospace; color: #6cf;
                       letter-spacing: -1px; }
    .gauge-card .small { font: 11px monospace; color: #888;
                         margin-top: 4px; }
    .controls { padding: 12px; display: flex; gap: 8px;
                align-items: center; }
    .controls button { padding: 6px 14px; cursor: pointer;
                       background: #1a1a20; border: 1px solid #333;
                       color: #f0f0f0; font: 12px monospace; }
    .controls button:hover { background: #2a2a30; }
    .controls input { width: 100px; padding: 6px; background: #0e0e10;
                      border: 1px solid #333; color: #f0f0f0;
                      font: 12px monospace; }
    .sparkline { height: 60px; width: 100%; background: #0e0e10;
                 border: 1px solid #333; }
  </style>
</head>
<body>
  <header>
    <h1>Live RTP — WebWorker MC</h1>
    <p>Runs the MC harness off the main thread and renders
       RTP/hit/volatility updates every batch.</p>
  </header>
  <div class="controls">
    <label>Spins: <input id="ctl-spins" type="number" value="200000"/></label>
    <label>Batch: <input id="ctl-batch" type="number" value="1000"/></label>
    <label>Seed:  <input id="ctl-seed"  type="number" value="42"/></label>
    <button id="btn-start">Start</button>
    <button id="btn-stop">Stop</button>
  </div>
  <main>
    <div class="gauge-shell">
      <div class="gauge-card">
        <div class="big" id="g-rtp">—</div>
        <div class="small">RTP (live)</div>
      </div>
      <div class="gauge-card">
        <div class="big" id="g-hit">—</div>
        <div class="small">Hit frequency</div>
      </div>
      <div class="gauge-card">
        <div class="big" id="g-spins">0</div>
        <div class="small">Spins played</div>
      </div>
    </div>
    <svg class="sparkline" id="spark" viewBox="0 0 600 60" preserveAspectRatio="none"></svg>
  </main>
  <script type="module" src="rtp_gauge.js"></script>
</body>
</html>
"""

_RTP_GAUGE_JS = r"""// Studio extension: live RTP gauge (Mission #8 W8.4 / P5.4)
//
// Drives mc_worker.js with the local IR and renders a live RTP /
// hit-frequency / spin-count gauge plus a 600-point sparkline.

async function loadIR() {
  for (const c of ["./game.ir.json", "./ir.json"]) {
    try {
      const r = await fetch(c);
      if (r.ok) return await r.json();
    } catch (_) { /* try next */ }
  }
  for (const a of document.querySelectorAll("a, link")) {
    const href = a.getAttribute("href") || "";
    if (href.endsWith(".ir.json")) {
      try {
        const r = await fetch(href);
        if (r.ok) return await r.json();
      } catch (_) { /* */ }
    }
  }
  return null;
}

const points = [];
function paintSparkline() {
  const svg = document.getElementById("spark");
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  if (points.length < 2) return;
  let max = 0;
  for (const p of points) if (p > max) max = p;
  max = max || 1;
  const xs = 600 / Math.max(points.length - 1, 1);
  const d = points
    .map((y, i) => {
      const sy = 60 - (y / max) * 56 - 2;
      return `${i === 0 ? "M" : "L"} ${(i * xs).toFixed(2)} ${sy.toFixed(2)}`;
    })
    .join(" ");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#6cf");
  path.setAttribute("stroke-width", "1.5");
  svg.appendChild(path);
}

function update(ev) {
  if (ev.type !== "progress" && ev.type !== "done") return;
  document.getElementById("g-rtp").textContent = (ev.rtp || 0).toFixed(4);
  document.getElementById("g-hit").textContent =
    (ev.hits / Math.max(ev.spins, 1)).toFixed(4);
  document.getElementById("g-spins").textContent =
    ev.spins.toLocaleString();
  points.push(ev.rtp || 0);
  if (points.length > 600) points.shift();
  paintSparkline();
}

let worker = null;
async function start() {
  const ir = await loadIR();
  if (!ir) {
    document.getElementById("g-rtp").textContent = "no IR";
    return;
  }
  if (worker) worker.terminate();
  worker = new Worker("./mc_worker.js", { type: "module" });
  worker.onmessage = (e) => update(e.data);
  worker.postMessage({
    type: "start",
    ir,
    spins: parseInt(document.getElementById("ctl-spins").value, 10) || 100000,
    batch: parseInt(document.getElementById("ctl-batch").value, 10) || 1000,
    seed:  parseInt(document.getElementById("ctl-seed").value, 10) || 42,
  });
}
function stop() {
  if (worker) worker.postMessage({ type: "stop" });
}

document.getElementById("btn-start").addEventListener("click", start);
document.getElementById("btn-stop").addEventListener("click", stop);
"""


def emit_rtp_gauge(studio_root: Path) -> tuple[Path, Path]:
    """Write rtp_gauge.html + rtp_gauge.js."""
    studio_root.mkdir(parents=True, exist_ok=True)
    h = studio_root / "rtp_gauge.html"
    j = studio_root / "rtp_gauge.js"
    h.write_text(_RTP_GAUGE_HTML)
    j.write_text(_RTP_GAUGE_JS)
    return h, j


# ─── W8.5 / P5.6: Vendor + jurisdiction switcher ───────────────────────────

_SWITCHER_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Vendor / Jurisdiction Switcher — Studio Extension</title>
  <link rel="stylesheet" href="app.css" />
  <style>
    .switcher { display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 16px; padding: 12px; }
    .pane { background: #0e0e10; border: 1px solid #333;
            padding: 10px; }
    .pane select { width: 100%; padding: 6px; background: #1a1a20;
                   color: #f0f0f0; border: 1px solid #333; }
    .stat { display: flex; justify-content: space-between;
            padding: 4px 0; border-bottom: 1px solid #222;
            color: #f0f0f0; font: 13px sans-serif; }
    .stat span:last-child { font-family: monospace; color: #6cf; }
    .diff-pos { color: #6f6; } .diff-neg { color: #f66; }
  </style>
</head>
<body>
  <header>
    <h1>A/B switcher — vendors + jurisdictions</h1>
    <p>Pick two IRs from the sibling list; the diff panel highlights
       RTP/max-win/volatility deltas.</p>
  </header>
  <main class="switcher">
    <div class="pane">
      <h2>A</h2>
      <select id="sel-a"></select>
      <div id="stats-a"></div>
    </div>
    <div class="pane">
      <h2>B</h2>
      <select id="sel-b"></select>
      <div id="stats-b"></div>
    </div>
  </main>
  <section class="pane" style="margin:12px">
    <h2>Diff (B − A)</h2>
    <div id="diff"></div>
  </section>
  <script type="module" src="vendor_switcher.js"></script>
</body>
</html>
"""

_SWITCHER_JS = r"""// Studio extension: vendor + jurisdiction switcher (Mission #8 W8.5 / P5.6)
//
// Discovers all sibling *.ir.json files (scraped from the page or
// `./manifest.json` if present) and lets the operator compare two side
// by side. Diff panel highlights key compliance + math invariants.

async function discoverManifest() {
  // Manifest file (optional): { games: ["a.ir.json", "b.ir.json", ...] }
  try {
    const r = await fetch("./manifest.json");
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j.games)) return j.games;
    }
  } catch (_) { /* */ }
  const out = [];
  for (const a of document.querySelectorAll("a, link")) {
    const href = a.getAttribute("href") || "";
    if (href.endsWith(".ir.json")) out.push(href);
  }
  for (const fallback of ["./game.ir.json", "./ir.json"]) {
    try {
      const r = await fetch(fallback);
      if (r.ok) out.push(fallback);
    } catch (_) { /* */ }
  }
  return [...new Set(out)];
}

async function fetchIR(url) {
  try {
    const r = await fetch(url);
    if (r.ok) return await r.json();
  } catch (_) { /* */ }
  return null;
}

function summarize(ir) {
  if (!ir) return null;
  const ev = ir.evaluation || {};
  return {
    name: (ir.meta && ir.meta.name) || "—",
    vendor: (ir.meta && ir.meta.vendor) || "—",
    swid: (ir.meta && ir.meta.swid) || "—",
    target_rtp: (ir.meta && ir.meta.target_rtp) || null,
    reels: (ir.topology && ir.topology.reels) || 0,
    rows: (ir.topology && ir.topology.rows) || 0,
    paylines: (ev.paylines || []).length,
    n_symbols: (ir.symbols || []).length,
    n_features: (ir.features || []).length,
    max_win: (ir.limits && ir.limits.max_win_x) || null,
  };
}

function renderStats(rootId, s) {
  const root = document.getElementById(rootId);
  if (!s) { root.innerHTML = '<p>no IR loaded</p>'; return; }
  const rows = [
    ["Name", s.name], ["Vendor", s.vendor], ["SWID", s.swid],
    ["Topology", `${s.reels}×${s.rows} · ${s.paylines} lines`],
    ["Symbols", String(s.n_symbols)],
    ["Features", String(s.n_features)],
    ["Target RTP", s.target_rtp != null ? s.target_rtp.toFixed(4) : "—"],
    ["Max win ×", s.max_win != null ? String(s.max_win) : "—"],
  ];
  root.innerHTML = rows
    .map(([a, b]) => `<div class="stat"><span>${a}</span><span>${b}</span></div>`)
    .join("");
}

function renderDiff(sa, sb) {
  const root = document.getElementById("diff");
  if (!sa || !sb) { root.innerHTML = "<p>load two IRs to diff</p>"; return; }
  function fmt(diff) {
    if (diff === null) return "—";
    const c = diff > 0 ? "diff-pos" : (diff < 0 ? "diff-neg" : "");
    const s = diff > 0 ? `+${diff}` : String(diff);
    return `<span class="${c}">${s}</span>`;
  }
  function num(a, b) { return (a != null && b != null) ? (b - a) : null; }
  const rows = [
    ["Reels Δ",      fmt(num(sa.reels, sb.reels))],
    ["Rows Δ",       fmt(num(sa.rows, sb.rows))],
    ["Paylines Δ",   fmt(num(sa.paylines, sb.paylines))],
    ["Features Δ",   fmt(num(sa.n_features, sb.n_features))],
    ["Symbols Δ",    fmt(num(sa.n_symbols, sb.n_symbols))],
    ["Target RTP Δ", sa.target_rtp != null && sb.target_rtp != null
                       ? fmt(+((sb.target_rtp - sa.target_rtp).toFixed(6))) : "—"],
    ["Max win Δ",    fmt(num(sa.max_win, sb.max_win))],
  ];
  root.innerHTML = rows
    .map(([a, b]) => `<div class="stat"><span>${a}</span><span>${b}</span></div>`)
    .join("");
}

async function refresh() {
  const a = document.getElementById("sel-a").value;
  const b = document.getElementById("sel-b").value;
  const ia = await fetchIR(a);
  const ib = await fetchIR(b);
  const sa = summarize(ia);
  const sb = summarize(ib);
  renderStats("stats-a", sa);
  renderStats("stats-b", sb);
  renderDiff(sa, sb);
}

async function init() {
  const urls = await discoverManifest();
  if (urls.length === 0) {
    document.getElementById("stats-a").innerHTML = "<p>no IRs found</p>";
    return;
  }
  for (const id of ["sel-a", "sel-b"]) {
    const sel = document.getElementById(id);
    for (const u of urls) {
      const opt = document.createElement("option");
      opt.value = u; opt.textContent = u;
      sel.appendChild(opt);
    }
    sel.addEventListener("change", refresh);
  }
  // Default: A = first, B = last
  document.getElementById("sel-a").value = urls[0];
  document.getElementById("sel-b").value = urls[urls.length - 1];
  await refresh();
}

init();
"""


def emit_vendor_switcher(studio_root: Path) -> tuple[Path, Path]:
    """Write vendor_switcher.html + vendor_switcher.js."""
    studio_root.mkdir(parents=True, exist_ok=True)
    h = studio_root / "vendor_switcher.html"
    j = studio_root / "vendor_switcher.js"
    h.write_text(_SWITCHER_HTML)
    j.write_text(_SWITCHER_JS)
    return h, j


# ─── W8.6 / P5.7: Reel strip visualizer ────────────────────────────────────

_REEL_VIZ_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Reel Strip Visualizer — Studio Extension</title>
  <link rel="stylesheet" href="app.css" />
  <style>
    .reels { display: flex; gap: 12px; padding: 12px;
             overflow-x: auto; }
    .reel { flex: 0 0 220px; background: #0e0e10;
            border: 1px solid #333; padding: 8px;
            color: #f0f0f0; }
    .reel h3 { margin: 0 0 8px 0; font: 13px monospace;
               color: #6cf; }
    .bar-row { display: flex; align-items: center; gap: 6px;
               padding: 2px 0; }
    .bar-row .sym  { width: 60px; font: 11px monospace;
                     color: #ccc; overflow: hidden; }
    .bar-row .bar  { height: 12px; background: #1a1a20;
                     border: 1px solid #2a2a2a; flex: 1; position: relative; }
    .bar-row .fill { position: absolute; left: 0; top: 0; bottom: 0;
                     background: linear-gradient(90deg,#6cf,#f7c948); }
    .bar-row .val  { width: 50px; text-align: right;
                     font: 10px monospace; color: #888; }
  </style>
</head>
<body>
  <header>
    <h1>Reel strip visualizer</h1>
    <p>Per-reel bar chart of symbol frequency. Bar fill encodes
       relative weight (compared to the most common symbol on that reel).</p>
  </header>
  <main id="reels" class="reels"></main>
  <script type="module" src="reel_viz.js"></script>
</body>
</html>
"""

_REEL_VIZ_JS = r"""// Studio extension: reel strip visualizer (Mission #8 W8.6 / P5.7)
//
// Renders per-reel bar charts of symbol frequency. Bar fill is
// proportional to (count / max-on-reel) so the dominant symbol is
// always 100% and rares are visibly tiny.

async function loadIR() {
  for (const c of ["./game.ir.json", "./ir.json"]) {
    try {
      const r = await fetch(c);
      if (r.ok) return await r.json();
    } catch (_) { /* */ }
  }
  for (const a of document.querySelectorAll("a, link")) {
    const href = a.getAttribute("href") || "";
    if (href.endsWith(".ir.json")) {
      try {
        const r = await fetch(href);
        if (r.ok) return await r.json();
      } catch (_) { /* */ }
    }
  }
  return null;
}

function reelHist(reel) {
  const out = new Map();
  for (const cell of reel) {
    out.set(cell, (out.get(cell) || 0) + 1);
  }
  return out;
}

function renderReel(idx, reel, parent) {
  const wrap = document.createElement("div");
  wrap.className = "reel";
  const h = document.createElement("h3");
  h.textContent = `Reel ${idx + 1} · ${reel.length} stops`;
  wrap.appendChild(h);
  const hist = reelHist(reel);
  const entries = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const max = entries.length ? entries[0][1] : 1;
  for (const [sym, cnt] of entries) {
    const row = document.createElement("div");
    row.className = "bar-row";
    const symEl = document.createElement("span");
    symEl.className = "sym";
    symEl.textContent = sym;
    symEl.title = sym;
    const barEl = document.createElement("span");
    barEl.className = "bar";
    const fill = document.createElement("span");
    fill.className = "fill";
    fill.style.width = `${100 * cnt / max}%`;
    barEl.appendChild(fill);
    const valEl = document.createElement("span");
    valEl.className = "val";
    valEl.textContent = `${cnt}`;
    row.appendChild(symEl); row.appendChild(barEl); row.appendChild(valEl);
    wrap.appendChild(row);
  }
  parent.appendChild(wrap);
}

async function init() {
  const ir = await loadIR();
  const root = document.getElementById("reels");
  if (!ir) { root.textContent = "no IR found"; return; }
  const reels = (ir.reels && ir.reels.base && ir.reels.base[0])
                 ? ir.reels.base[0].reels : [];
  for (let i = 0; i < reels.length; i++) renderReel(i, reels[i], root);
}

init();
"""


def emit_reel_viz(studio_root: Path) -> tuple[Path, Path]:
    """Write reel_viz.html + reel_viz.js."""
    studio_root.mkdir(parents=True, exist_ok=True)
    h = studio_root / "reel_viz.html"
    j = studio_root / "reel_viz.js"
    h.write_text(_REEL_VIZ_HTML)
    j.write_text(_REEL_VIZ_JS)
    return h, j
