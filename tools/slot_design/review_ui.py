"""P10.3 — Studio iterative refinement UI.

Emits a self-contained `review.html` + `review.js` pair that loads the
sibling `spec.json` + `game.dsl.toml` + `<slug>.slot-sim.ir.json` and
shows the designer:

  - Left pane:  PromptSpec parsing audit (read-only)
  - Right pane: DSL TOML (live-editable textarea)
  - Bottom strip: composition plan summary (feature shares, base headroom)
  - Action: download edited DSL → re-run `slot-design --from-dsl` to relock

No external deps; vanilla HTML/JS, works via `python -m http.server`.

Companion to W6.6 `tools/gdd_extract/review_ui.py` — same pattern but
sourced from NL prompt instead of GDD PDF.
"""

from __future__ import annotations

from pathlib import Path


_HTML_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>slot-design Review</title>
  <style>
    :root {
      --bg: #0d1117;
      --fg: #c9d1d9;
      --accent: #58a6ff;
      --border: #30363d;
      --card: #161b22;
      --warn: #d29922;
      --ok: #3fb950;
    }
    body { font-family: -apple-system, "SF Pro Display", system-ui, sans-serif;
           background: var(--bg); color: var(--fg); margin: 0; padding: 20px; }
    h1 { color: var(--accent); margin: 0 0 8px 0; }
    .meta { color: #8b949e; font-size: 13px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { background: var(--card); border: 1px solid var(--border);
            border-radius: 8px; padding: 14px; }
    .card h2 { margin: 0 0 10px 0; font-size: 15px; color: var(--accent); }
    .audit { font-family: "SF Mono", monospace; font-size: 12px;
             max-height: 480px; overflow-y: auto; }
    .audit li { padding: 2px 0; border-bottom: 1px dotted #30363d20; }
    textarea { width: 100%; min-height: 480px; background: #0d1117;
               color: #c9d1d9; border: 1px solid var(--border);
               border-radius: 6px; padding: 10px; font-family: "SF Mono", monospace;
               font-size: 13px; resize: vertical; }
    .actions { margin: 16px 0; display: flex; gap: 12px; align-items: center; }
    button { background: var(--accent); color: #0d1117; border: none;
             padding: 8px 16px; border-radius: 6px; font-weight: 600;
             cursor: pointer; }
    button.secondary { background: var(--card); color: var(--fg);
                       border: 1px solid var(--border); }
    .summary { display: grid; grid-template-columns: repeat(4, 1fr);
               gap: 12px; margin-top: 16px; }
    .stat { background: var(--card); border: 1px solid var(--border);
            border-radius: 6px; padding: 10px; }
    .stat .label { font-size: 11px; color: #8b949e;
                   text-transform: uppercase; letter-spacing: 0.5px; }
    .stat .value { font-size: 18px; font-weight: 600; color: var(--accent); margin-top: 4px; }
    .stat.warn .value { color: var(--warn); }
    .stat.ok .value { color: var(--ok); }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--border); font-size: 13px; }
    th { color: #8b949e; font-weight: 500; }
    .toast { position: fixed; bottom: 20px; right: 20px;
             background: var(--accent); color: #0d1117; padding: 10px 18px;
             border-radius: 6px; opacity: 0; transition: opacity 0.3s; }
    .toast.show { opacity: 1; }
  </style>
</head>
<body>
  <h1>slot-design Review</h1>
  <div class="meta" id="meta-line">Loading…</div>

  <div class="actions">
    <button onclick="exportDsl()">Download edited DSL</button>
    <button class="secondary" onclick="copyDsl()">Copy DSL</button>
    <button class="secondary" onclick="resetDsl()">Reset to original</button>
    <span style="color:#8b949e;font-size:12px;">
      Then re-run: <code>python -m tools.slot_design --from-dsl game.dsl.toml --out .</code>
    </span>
  </div>

  <div class="grid">
    <div class="card">
      <h2>Detection audit</h2>
      <ul id="audit" class="audit"><li>Loading spec.json…</li></ul>
    </div>
    <div class="card">
      <h2>DSL — hand-editable</h2>
      <textarea id="dsl-editor" spellcheck="false">Loading game.dsl.toml…</textarea>
    </div>
  </div>

  <div class="summary">
    <div class="stat"><div class="label">Topology</div>
      <div class="value" id="stat-topology">—</div></div>
    <div class="stat"><div class="label">Target RTP</div>
      <div class="value" id="stat-rtp">—</div></div>
    <div class="stat"><div class="label">Features</div>
      <div class="value" id="stat-features">—</div></div>
    <div class="stat" id="stat-base-card"><div class="label">Base-game share</div>
      <div class="value" id="stat-base">—</div></div>
  </div>

  <div class="card" style="margin-top:16px;">
    <h2>Feature composition plan (P10.2)</h2>
    <table id="composition-table">
      <thead><tr><th>Feature</th><th>Default share</th><th>Allocated share</th><th>Primary param</th></tr></thead>
      <tbody><tr><td colspan="4">Loading…</td></tr></tbody>
    </table>
  </div>

  <div id="toast" class="toast"></div>
  <script src="review.js"></script>
</body>
</html>
"""

_JS_TEMPLATE = """// slot-design review UI client.
// Loads sibling spec.json + game.dsl.toml; renders parsing audit + DSL
// editor. Pure vanilla JS, no deps.

const $ = (id) => document.getElementById(id);
let originalDsl = "";
let specCache = null;

async function loadSpec() {
  try {
    const res = await fetch("./spec.json");
    const spec = await res.json();
    specCache = spec;
    $("meta-line").textContent =
      `Prompt: "${spec.raw_prompt}" · target_rtp=${spec.target_rtp.toFixed(4)}` +
      ` · vendor=${spec.vendor_style} · volatility=${spec.volatility}`;
    const ul = $("audit");
    ul.innerHTML = "";
    for (const entry of spec.audit_log) {
      const li = document.createElement("li");
      li.textContent = entry;
      ul.appendChild(li);
    }
    $("stat-topology").textContent =
      `${spec.reels}×${spec.rows} (${spec.topology_shape})`;
    $("stat-rtp").textContent = (spec.target_rtp * 100).toFixed(2) + "%";
    $("stat-features").textContent =
      spec.features.map(f => f.kind).join(", ") || "(none)";
  } catch (e) {
    $("meta-line").textContent = "Failed to load spec.json: " + e.message;
  }
}

async function loadDsl() {
  try {
    const res = await fetch("./game.dsl.toml");
    const txt = await res.text();
    originalDsl = txt;
    $("dsl-editor").value = txt;
    parseDslForSummary(txt);
  } catch (e) {
    $("dsl-editor").value = "Failed to load game.dsl.toml: " + e.message;
  }
}

function parseDslForSummary(txt) {
  // Crude TOML scan for [meta] _feature_share_total + _base_game_share_target +
  // [[features]] kind lines. Enough for the composition table strip.
  const featureTotalMatch = txt.match(/_feature_share_total\\s*=\\s*([0-9.]+)/);
  const baseShareMatch = txt.match(/_base_game_share_target\\s*=\\s*([0-9.]+)/);
  const featureBlocks = txt.split(/\\[\\[features\\]\\]/).slice(1);
  const rows = [];
  for (const block of featureBlocks) {
    const kind = (block.match(/kind\\s*=\\s*"([^"]+)"/) || [])[1] || "?";
    const def = (block.match(/_rtp_share_default\\s*=\\s*([0-9.]+)/) || [])[1] || "—";
    const alloc = (block.match(/_rtp_share_alloc\\s*=\\s*([0-9.]+)/) || [])[1] || "—";
    rows.push({ kind, def, alloc });
  }
  const tbody = $("composition-table").querySelector("tbody");
  tbody.innerHTML = "";
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4">(no features in DSL)</td></tr>';
  } else {
    for (const r of rows) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.kind}</td><td>${r.def}</td><td>${r.alloc}</td><td>—</td>`;
      tbody.appendChild(tr);
    }
  }
  const baseEl = $("stat-base");
  if (baseShareMatch) {
    const baseShare = parseFloat(baseShareMatch[1]);
    baseEl.textContent = (baseShare * 100).toFixed(2) + "%";
    const card = $("stat-base-card");
    if (baseShare < 0.05) {
      card.classList.add("warn");
      card.classList.remove("ok");
    } else {
      card.classList.add("ok");
      card.classList.remove("warn");
    }
  } else {
    baseEl.textContent = "—";
  }
}

function exportDsl() {
  const txt = $("dsl-editor").value;
  const blob = new Blob([txt], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "game.reviewed.dsl.toml";
  a.click();
  URL.revokeObjectURL(url);
  toast("Downloaded game.reviewed.dsl.toml");
}

async function copyDsl() {
  try {
    await navigator.clipboard.writeText($("dsl-editor").value);
    toast("DSL copied to clipboard");
  } catch {
    toast("Copy failed (try export instead)");
  }
}

function resetDsl() {
  $("dsl-editor").value = originalDsl;
  parseDslForSummary(originalDsl);
  toast("Reset to original DSL");
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1800);
}

document.addEventListener("DOMContentLoaded", () => {
  loadSpec();
  loadDsl();
  $("dsl-editor").addEventListener("input", (e) =>
    parseDslForSummary(e.target.value));
});
"""


def emit_review_ui(out_dir: Path) -> tuple[Path, Path]:
    """Write `review.html` + `review.js` under `out_dir`.

    Returns the (html_path, js_path) tuple.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    html_path = out_dir / "review.html"
    js_path = out_dir / "review.js"
    html_path.write_text(_HTML_TEMPLATE)
    js_path.write_text(_JS_TEMPLATE)
    return html_path, js_path
