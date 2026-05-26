"""W6.6 — Human-in-loop GDD review UI emitter.

Emits a self-contained HTML/JS review page that loads a GDD extraction
JSON (`*.gdd.json` from W6.1) plus the synthesized DSL (`*.dsl.toml`
from W6.2), shows them side-by-side, and lets the human reviewer
edit individual sections before exporting a corrected DSL.

Pipeline integration:

    1. `slot-build --gdd game.gdd.pdf --summary game.gdd.json --dsl game.dsl.toml`
       emits the extraction + synthesized DSL.
    2. `slot-gdd-review-ui <out-dir>` emits the review HTML/JS.
    3. Reviewer opens `<out-dir>/review.html`, edits the textarea-based
       DSL panel; "Export" copies the corrected DSL to clipboard or
       downloads it as a `.toml` file.
    4. Once approved, re-run `slot-build --dsl <corrected>.dsl.toml`
       to get the final SMT-locked IR.

Why this matters
================

W6.1 + W6.2 are best-effort regex / heuristic parsers. Real-world GDD
PDFs have edge cases (table layouts, image-based paytables, mixed
language). Human review CLOSES THE LOOP: spec author signs off on the
DSL before SMT solver commits.

API:
    from tools.gdd_extract.review_ui import emit_review_ui
    paths = emit_review_ui(out_dir)
"""
from __future__ import annotations

from pathlib import Path


_REVIEW_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>GDD Review — W6.6 Human-in-loop</title>
  <style>
    body { background: #0e0e10; color: #f0f0f0;
           font: 13px/1.4 sans-serif; margin: 0; }
    header { padding: 12px 16px; background: #1a1a20;
             border-bottom: 1px solid #333; }
    header h1 { margin: 0 0 4px 0; font-size: 18px; color: #6cf; }
    header p { margin: 0; color: #aaa; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr;
            gap: 12px; padding: 12px;
            height: calc(100vh - 130px); }
    .pane { background: #1a1a20; border: 1px solid #333;
            padding: 12px; overflow-y: auto; }
    .pane h2 { margin: 0 0 8px 0; font-size: 14px; color: #6cf; }
    .section { background: #0e0e10; padding: 8px; margin-bottom: 8px;
               border: 1px solid #2a2a30; }
    .section .label { font: 11px monospace; color: #888;
                      margin-bottom: 4px; text-transform: uppercase; }
    .section .body { font: 11px monospace; color: #ccc;
                     white-space: pre-wrap; word-break: break-word; }
    textarea#dsl { width: 100%; height: calc(100% - 60px);
                   font: 12px monospace; background: #0e0e10;
                   color: #c0c0c0; border: 1px solid #333; padding: 8px;
                   resize: none; }
    .controls { padding: 12px 16px; background: #1a1a20;
                border-top: 1px solid #333;
                display: flex; gap: 8px; align-items: center; }
    .controls button { padding: 6px 14px; cursor: pointer;
                       background: #2a2a30; border: 1px solid #444;
                       color: #f0f0f0; font: 12px monospace; }
    .controls button:hover { background: #3a3a40; }
    .controls .info { color: #888; font: 11px monospace;
                      margin-left: auto; }
    .controls input[type="file"] { color: #aaa; font: 11px monospace; }
  </style>
</head>
<body>
  <header>
    <h1>GDD Review — Human-in-loop</h1>
    <p>Left: extracted GDD sections (read-only).
       Right: synthesized DSL (editable). Export when approved.</p>
  </header>
  <div class="grid">
    <div class="pane">
      <h2>Extracted GDD sections</h2>
      <div id="gdd-sections">no GDD JSON loaded</div>
    </div>
    <div class="pane">
      <h2>DSL (TOML — editable)</h2>
      <textarea id="dsl" spellcheck="false"></textarea>
    </div>
  </div>
  <div class="controls">
    <label>GDD JSON: <input type="file" id="gdd-file" accept=".json"/></label>
    <label>DSL TOML: <input type="file" id="dsl-file" accept=".toml,.txt"/></label>
    <button id="btn-export">Export DSL ↓</button>
    <button id="btn-copy">Copy to clipboard</button>
    <span class="info" id="info">—</span>
  </div>
  <script type="module" src="review.js"></script>
</body>
</html>
"""

_REVIEW_JS = r"""// W6.6 — GDD review UI (Human-in-loop closer to SMT lock)
//
// Pure browser app: no build step, no node_modules. Loads two
// optional sibling files (./game.gdd.json + ./game.dsl.toml) if they
// exist; otherwise the user uploads them via the file inputs.

function setInfo(msg) {
  document.getElementById("info").textContent = msg;
}

async function tryLoadSibling(name) {
  try {
    const r = await fetch(name);
    if (r.ok) return await r.text();
  } catch (_) { /* */ }
  return null;
}

function renderGdd(jsonText) {
  const root = document.getElementById("gdd-sections");
  while (root.firstChild) root.removeChild(root.firstChild);
  let parsed;
  try { parsed = JSON.parse(jsonText); }
  catch (e) { root.textContent = "JSON parse error: " + e.message; return; }
  const sections = (parsed && parsed.raw_sections) || parsed || {};
  if (!Object.keys(sections).length) {
    root.textContent = "no sections in GDD JSON";
    return;
  }
  for (const [label, body] of Object.entries(sections)) {
    const el = document.createElement("div");
    el.className = "section";
    const lab = document.createElement("div");
    lab.className = "label";
    lab.textContent = label;
    const bd = document.createElement("div");
    bd.className = "body";
    bd.textContent = typeof body === "string"
                       ? body
                       : JSON.stringify(body, null, 2);
    el.appendChild(lab); el.appendChild(bd);
    root.appendChild(el);
  }
}

function setDsl(text) {
  document.getElementById("dsl").value = text;
}

document.getElementById("gdd-file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { renderGdd(r.result); setInfo("GDD loaded: " + f.name); };
  r.readAsText(f);
});

document.getElementById("dsl-file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { setDsl(r.result); setInfo("DSL loaded: " + f.name); };
  r.readAsText(f);
});

document.getElementById("btn-export").addEventListener("click", () => {
  const text = document.getElementById("dsl").value;
  const blob = new Blob([text], { type: "application/toml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "game.reviewed.dsl.toml";
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setInfo("DSL exported.");
});

document.getElementById("btn-copy").addEventListener("click", async () => {
  const text = document.getElementById("dsl").value;
  try {
    await navigator.clipboard.writeText(text);
    setInfo("DSL copied to clipboard.");
  } catch (e) {
    setInfo("Clipboard write failed: " + e.message);
  }
});

async function init() {
  const gdd = await tryLoadSibling("./game.gdd.json");
  if (gdd) { renderGdd(gdd); setInfo("Auto-loaded GDD"); }
  const dsl = await tryLoadSibling("./game.dsl.toml");
  if (dsl) { setDsl(dsl); setInfo("Auto-loaded DSL"); }
}
init();
"""


def emit_review_ui(out_dir: Path) -> tuple[Path, Path]:
    """Write `review.html` + `review.js` into `out_dir`.

    Returns (html_path, js_path).
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    h = out_dir / "review.html"
    j = out_dir / "review.js"
    h.write_text(_REVIEW_HTML)
    j.write_text(_REVIEW_JS)
    return h, j


def main(argv: list[str] | None = None) -> int:
    import argparse

    ap = argparse.ArgumentParser(
        prog="slot-gdd-review-ui",
        description="W6.6 — emit a human-in-loop GDD review HTML/JS UI",
    )
    ap.add_argument("out_dir",
                    help="output directory (will be created if missing)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)
    h, j = emit_review_ui(Path(args.out_dir))
    if not args.quiet:
        print(f"wrote {h}")
        print(f"wrote {j}")
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
