"""Generates the marketplace listing dashboard."""
from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from tools.plugin_marketplace.registry import (
    FilesystemMarketplace,
    PublishReceipt,
)
from tools.plugin_marketplace.verifier import MarketplaceVerifier


@dataclass
class DashboardArtifacts:
    out_dir: str
    index_html: str
    manifest_json: str
    verify_json: str
    n_plugins: int
    n_verified_ok: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "out_dir": self.out_dir,
            "index_html": self.index_html,
            "manifest_json": self.manifest_json,
            "verify_json": self.verify_json,
            "n_plugins": self.n_plugins,
            "n_verified_ok": self.n_verified_ok,
        }


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Slot-Math Plugin Marketplace</title>
<style>
  :root { --bg:#0d1117; --fg:#c9d1d9; --accent:#58a6ff;
           --ok:#3fb950; --warn:#d29922; --err:#f85149;
           --card:#161b22; --border:#30363d; }
  html, body { background:var(--bg); color:var(--fg);
               font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;
               margin:0; padding:0; }
  header { padding:24px 32px; border-bottom:1px solid var(--border); }
  h1 { margin:0 0 4px; color:var(--accent); font-size:24px; }
  small { color:#8b949e; }
  main { padding:24px 32px; max-width:1200px; margin:0 auto; }
  .card { background:var(--card); border:1px solid var(--border);
          border-radius:8px; padding:18px; margin-bottom:18px; }
  .card h2 { margin:0 0 12px; color:var(--fg); font-size:18px; }
  .row { display:flex; gap:16px; align-items:baseline; }
  .row .k { color:#8b949e; min-width:140px; font-size:13px; }
  .row .v { font-family:'SF Mono',Consolas,monospace; font-size:13px;
             word-break:break-all; }
  .pill { display:inline-block; padding:2px 8px; border-radius:10px;
          font-size:12px; font-weight:600; }
  .pill.ok { background:rgba(63,185,80,.2); color:var(--ok); }
  .pill.err { background:rgba(248,81,73,.2); color:var(--err); }
  .pill.warn { background:rgba(210,153,34,.2); color:var(--warn); }
  button { background:var(--accent); color:#fff; border:none;
           padding:6px 12px; border-radius:6px; cursor:pointer;
           font-size:13px; }
  button:hover { filter:brightness(1.1); }
  pre { background:rgba(255,255,255,.04); padding:10px;
        border-radius:6px; font-size:12px; overflow-x:auto;
        max-height:180px; }
  .empty { color:#8b949e; text-align:center; padding:32px; }
</style>
</head>
<body>
<header>
  <h1>Slot-Math Plugin Marketplace</h1>
  <small>Generated: __GENERATED_AT__ · Registry: <code>__REGISTRY__</code></small>
</header>
<main>
  <div id="summary" class="card">
    <h2>Summary</h2>
    <div class="row"><span class="k">Plugins</span><span class="v" id="n_plugins">…</span></div>
    <div class="row"><span class="k">Verified ok</span><span class="v" id="n_verified">…</span></div>
    <div class="row"><span class="k">Registry root</span><span class="v">__REGISTRY__</span></div>
  </div>
  <div id="grid"></div>
</main>
<script>
async function fetchJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("fetch " + path + " " + r.status);
  return await r.json();
}

function pill(text, kind) {
  return `<span class="pill ${kind}">${text}</span>`;
}

function rowHTML(k, v) {
  return `<div class="row"><span class="k">${k}</span><span class="v">${v}</span></div>`;
}

function pluginCard(p, verify) {
  const vfy = verify[p.handle] || null;
  const verdict = vfy && vfy.passed
      ? pill("VERIFIED", "ok")
      : vfy === null
        ? pill("UNCHECKED", "warn")
        : pill("FAILED", "err");
  return `<div class="card">
    <h2>${p.plugin_id} <small style="color:#8b949e">v${p.version}</small> ${verdict}</h2>
    ${rowHTML("Handle", p.handle)}
    ${rowHTML("body SHA-256", p.body_sha256)}
    ${rowHTML("Published at", p.published_at_utc)}
    ${p.signature_b64 ? rowHTML("Signature (b64)", p.signature_b64.slice(0, 40) + '…') : ''}
    <div style="margin-top:10px">
      <button onclick="document.getElementById('vfy-${p.handle}').classList.toggle('open')">Toggle verify report</button>
    </div>
    <pre id="vfy-${p.handle}" style="display:none;margin-top:10px">${vfy ? JSON.stringify(vfy, null, 2) : 'no verifier output'}</pre>
  </div>`;
}

(async () => {
  try {
    const [manifest, verify] = await Promise.all([
      fetchJSON("manifest.json"),
      fetchJSON("verify.json"),
    ]);
    document.getElementById("n_plugins").textContent = manifest.plugins.length;
    document.getElementById("n_verified").textContent =
      Object.values(verify).filter(v => v && v.passed).length;
    const grid = document.getElementById("grid");
    if (!manifest.plugins.length) {
      grid.innerHTML = '<div class="empty">No plugins published yet.</div>';
      return;
    }
    grid.innerHTML = manifest.plugins.map(p => pluginCard(p, verify)).join('');
    // un-hide toggling
    document.querySelectorAll('pre').forEach(p => {
      const orig = p.style.display;
      p.addEventListener('click', () => p.style.display = 'block');
    });
    // Allow toggle:
    document.querySelectorAll('button').forEach(b => {
      b.addEventListener('click', e => {
        const id = e.target.getAttribute('onclick').match(/'(.+)'/)[1];
        const el = document.getElementById(id);
        el.style.display = el.style.display === 'block' ? 'none' : 'block';
      });
    });
  } catch (e) {
    document.body.insertAdjacentHTML('beforeend',
      `<div class="card" style="color:var(--err)">Failed to load: ${e}</div>`);
  }
})();
</script>
</body>
</html>
"""


def render_index_html(*, registry_path: str, generated_at: str) -> str:
    return (
        HTML_TEMPLATE
        .replace("__REGISTRY__", registry_path)
        .replace("__GENERATED_AT__", generated_at)
    )


def _list_receipts(registry: FilesystemMarketplace) -> list[PublishReceipt]:
    """Recover all receipts from the FilesystemMarketplace.

    The registry stores all receipts in a single `receipts.json`
    at the root, keyed by handle.
    """
    out: list[PublishReceipt] = []
    receipts_file = Path(registry.root) / "receipts.json"
    if not receipts_file.exists():
        return out
    try:
        data = json.loads(receipts_file.read_text())
    except json.JSONDecodeError:
        return out
    for handle, d in sorted(data.items()):
        if not isinstance(d, dict):
            continue
        out.append(PublishReceipt(
            plugin_id=str(d.get("plugin_id", "")),
            version=str(d.get("version", "")),
            handle=str(d.get("handle", handle)),
            body_sha256=str(d.get("body_sha256", "")),
            published_at_utc=str(d.get("published_at_utc", "")),
            signature_b64=d.get("signature_b64"),
        ))
    return out


def _verify_all(
    registry: FilesystemMarketplace, download_dir: Path
) -> dict[str, dict[str, Any]]:
    """Run a verifier round-trip per plugin and collect reports."""
    out: dict[str, dict[str, Any]] = {}
    verifier = MarketplaceVerifier(registry=registry)
    receipts_file = Path(registry.root) / "receipts.json"
    if not receipts_file.exists():
        return out
    try:
        data = json.loads(receipts_file.read_text())
    except json.JSONDecodeError:
        return out
    for handle, d in sorted(data.items()):
        if not isinstance(d, dict):
            continue
        body_path = Path(d.get("_local_path", ""))
        if not body_path.exists():
            out[handle] = {
                "passed": False, "error": "body zip missing",
            }
            continue
        try:
            rt = verifier.round_trip(
                body_path,
                plugin_id=str(d.get("plugin_id", "")),
                version=str(d.get("version", "")) + "-verify",
                download_dir=download_dir,
                signature_b64=d.get("signature_b64"),
            )
            out[handle] = rt.to_dict()
        except Exception as e:  # noqa: BLE001
            out[handle] = {
                "passed": False, "error": str(e),
            }
    return out


def build_dashboard(
    registry: FilesystemMarketplace,
    out_dir: Path,
    *,
    verify: bool = True,
) -> DashboardArtifacts:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    receipts = _list_receipts(registry)
    manifest = {
        "registry_root": str(registry.root),
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "plugins": [r.to_dict() for r in receipts],
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True))

    verify_path = out_dir / "verify.json"
    if verify:
        download_dir = out_dir / "_verify_downloads"
        verify_map = _verify_all(registry, download_dir)
    else:
        verify_map = {}
    verify_path.write_text(json.dumps(verify_map, indent=2, sort_keys=True))

    index_path = out_dir / "index.html"
    index_path.write_text(render_index_html(
        registry_path=str(registry.root),
        generated_at=manifest["generated_at_utc"],
    ))

    n_ok = sum(1 for v in verify_map.values()
               if isinstance(v, dict) and v.get("passed"))
    return DashboardArtifacts(
        out_dir=str(out_dir),
        index_html=str(index_path),
        manifest_json=str(manifest_path),
        verify_json=str(verify_path),
        n_plugins=len(receipts),
        n_verified_ok=n_ok,
    )
