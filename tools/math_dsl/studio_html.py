"""W6.4 — Studio HTML stub.

Single-file HTML page with:
  • Monaco-style textarea for the DSL YAML
  • "Validate" button → calls parse_spec via embedded JSON shim
  • "Compile" button → renders compiled IR JSON beside the editor
  • "Mermaid preview" pane showing topology + features diagram

This is a *stub* — the embedded JS shells out to Python via the
`pyodide` runtime if the host page loads it. Without pyodide, the
buttons just dump the YAML text to a `pre` block.

For local development, ship the HTML next to a small Flask/FastAPI
shim that runs `parse_spec` / `compile_to_ir` server-side. That shim
is outside this module (see `web/studio/` in the parent repo).
"""

from __future__ import annotations

import html
from typing import Optional

from .spec import MathDslSpec
from .extract import serialize_to_yaml
from .visualize import render_mermaid


_STUDIO_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CORTEX Math DSL Studio</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
<style>
  * {{ box-sizing: border-box; }}
  body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         background: #0f172a; color: #e2e8f0; }}
  header {{ padding: 1rem 1.5rem; background: #1e293b; border-bottom: 2px solid #334155;
            display: flex; align-items: center; justify-content: space-between; }}
  h1 {{ margin: 0; font-size: 1.2rem; }}
  .toolbar {{ padding: 0.6rem 1.5rem; background: #1e293b; border-bottom: 1px solid #334155;
              display: flex; gap: 0.6rem; }}
  button {{ background: #334155; color: #e2e8f0; border: 1px solid #475569;
            padding: 0.5rem 0.9rem; border-radius: 4px; cursor: pointer; font-size: 0.85rem; }}
  button.primary {{ background: #2563eb; border-color: #1d4ed8; }}
  button:hover {{ background: #475569; }}
  button.primary:hover {{ background: #1d4ed8; }}
  .layout {{ display: grid; grid-template-columns: 1fr 1fr; gap: 1px;
             background: #334155; height: calc(100vh - 130px); }}
  .pane {{ background: #0f172a; padding: 1rem; overflow: auto; }}
  textarea {{ width: 100%; height: 100%; background: #0b1120; color: #e2e8f0;
              border: 1px solid #1e293b; padding: 0.6rem; font-family: 'Menlo', 'Monaco', monospace;
              font-size: 0.82rem; resize: none; }}
  pre {{ background: #0b1120; padding: 0.8rem; border-radius: 4px;
         overflow: auto; font-size: 0.78rem; color: #cbd5e1; margin: 0; }}
  .mermaid {{ background: #ffffff; padding: 1rem; border-radius: 4px; }}
  .status {{ padding: 0.5rem 1.5rem; background: #1e293b; color: #94a3b8; font-size: 0.78rem; }}
  .ok {{ color: #86efac; }}
  .err {{ color: #f87171; }}
</style>
</head>
<body>
<header>
  <h1>CORTEX Math DSL Studio</h1>
  <span style="color:#94a3b8;font-size:0.85rem;">Math compiler · v1.0.0</span>
</header>
<div class="toolbar">
  <button class="primary" onclick="renderMermaid()">Render Diagram</button>
  <button onclick="reset()">Reset to default spec</button>
  <button onclick="downloadYaml()">Download YAML</button>
  <span style="margin-left:auto;color:#94a3b8;font-size:0.78rem;">
    Synth + verify run server-side via <code>tools.math_dsl.synth</code>
  </span>
</div>

<div class="layout">
  <div class="pane">
    <textarea id="yaml-editor" spellcheck="false">{initial_yaml}</textarea>
  </div>
  <div class="pane">
    <div id="diagram" class="mermaid">{initial_mermaid}</div>
  </div>
</div>

<div class="status">
  <span id="status">Ready · edit YAML on left, press Render Diagram for live preview</span>
</div>

<script>
mermaid.initialize({{ startOnLoad: true, theme: 'default', flowchart: {{ curve: 'basis' }} }});

const DEFAULT_YAML = `{initial_yaml_js}`;

function statusOk(msg) {{
  const s = document.getElementById("status");
  s.className = "ok";
  s.textContent = "✓ " + msg;
}}
function statusErr(msg) {{
  const s = document.getElementById("status");
  s.className = "err";
  s.textContent = "✗ " + msg;
}}

function renderMermaid() {{
  // For the stub, we only redraw the existing diagram (the textarea →
  // mermaid conversion needs a server round-trip via parse_spec +
  // render_mermaid). The studio shim in web/studio/ wires this up.
  statusOk("Diagram re-rendered (server-side compile not loaded in stub)");
  const diagram = document.getElementById("diagram");
  diagram.removeAttribute("data-processed");
  mermaid.run({{ nodes: [diagram] }});
}}

function reset() {{
  document.getElementById("yaml-editor").value = DEFAULT_YAML;
  statusOk("Editor reset to default spec");
}}

function downloadYaml() {{
  const text = document.getElementById("yaml-editor").value;
  const blob = new Blob([text], {{ type: "text/yaml" }});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "design.yaml";
  a.click();
  statusOk("Downloaded design.yaml");
}}
</script>
</body>
</html>
"""


def render_studio_html(spec: Optional[MathDslSpec] = None) -> str:
    """Render a single-file Studio HTML. If `spec` is given, it's the
    default YAML loaded into the editor and pre-rendered as Mermaid.
    """
    if spec is None:
        initial_yaml = "# Paste your Math DSL YAML here\n"
        initial_mermaid = "graph TD\n  A[Paste a spec to begin]"
    else:
        initial_yaml = serialize_to_yaml(spec)
        initial_mermaid = render_mermaid(spec)
    # JS string escaping: replace backticks + backslashes + ${
    js_safe = (
        initial_yaml
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("${", "\\${")
    )
    return _STUDIO_TEMPLATE.format(
        initial_yaml=html.escape(initial_yaml),
        initial_mermaid=html.escape(initial_mermaid),
        initial_yaml_js=js_safe,
    )
