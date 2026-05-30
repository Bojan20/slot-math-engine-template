#!/usr/bin/env python3
"""W244 wave 62 — per-kernel HTML reference cards.

Generates jedan HTML page po kernelu pod `reports/dossier/kernels/`:
  • Kernel name + industry pattern paragraph
  • Master kernel Merkle (sha-256)
  • Fixture count + per-fixture table sa svim records
  • Industry references / monorepo paths
  • Cross-link nav nazad na sva 3 dossier-a + drugi kernels

Plus jedan `index.html` koji lista svih 22 sa search.

Output: `reports/dossier/kernels/{kernel_name}.html` × 22
        `reports/dossier/kernels/index.html`

Deterministic — byte-stable rebuild.
"""
from __future__ import annotations

import hashlib
import html
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
ACCEPT = REPO / "reports" / "acceptance"
OUT_DIR = REPO / "reports" / "dossier" / "kernels"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def _esc(v) -> str:
    return html.escape("" if v is None else str(v))


def _is_simple(v) -> bool:
    return isinstance(v, (int, float, str, bool)) or v is None


def _render_value(v) -> str:
    if isinstance(v, float):
        if abs(v) < 1e-4 or abs(v) > 1e6:
            return f"{v:.4e}"
        return f"{v:.6f}".rstrip("0").rstrip(".") or "0"
    if isinstance(v, bool):
        return "✓" if v else "✗"
    if v is None:
        return "—"
    if isinstance(v, (list, tuple)):
        if all(_is_simple(x) for x in v) and len(v) < 8:
            return ", ".join(_render_value(x) for x in v)
        return f"<pre>{_esc(json.dumps(v, indent=2))}</pre>"
    if isinstance(v, dict):
        return f"<pre>{_esc(json.dumps(v, indent=2))}</pre>"
    return _esc(v)


def _render_record(rec: dict, idx: int) -> str:
    fixture = rec.get("fixture_name", f"fixture_{idx}")
    desc = rec.get("description", "")
    rtp = rec.get("rtp_contribution")
    # Build rows for every key except the headers we display specially
    skip = {"fixture_name", "description"}
    rows = []
    for k, v in rec.items():
        if k in skip:
            continue
        rows.append(
            f'<tr><th>{_esc(k)}</th><td>{_render_value(v)}</td></tr>'
        )
    rtp_html = (
        f'<div class="rtp">RTP contribution: <strong>'
        f'{_render_value(rtp)}</strong></div>'
        if rtp is not None else ""
    )
    return f'''
    <article class="fixture" id="f{idx}">
      <header>
        <h3>{_esc(fixture)}</h3>
        <p>{_esc(desc)}</p>
        {rtp_html}
      </header>
      <table class="kv">
        <tbody>{"".join(rows)}</tbody>
      </table>
    </article>'''


# Shared CSS used by every kernel page + index
CSS_SHARED = """
:root {
  --bg: #0a0e14; --bg-card: #131821; --bg-elev: #1c2230;
  --fg: #e6e9ef; --fg-mute: #9098a8;
  --acc: #4cc4ff; --acc2: #ffb84c; --green: #6dd49d;
  --border: #2a3142;
}
* { box-sizing: border-box; }
body {
  font: 14px/1.5 -apple-system, "Segoe UI", system-ui, sans-serif;
  margin: 0; background: var(--bg); color: var(--fg);
}
header.top {
  padding: 36px 32px 20px;
  background: linear-gradient(180deg, #0e1320 0%, var(--bg) 100%);
  border-bottom: 1px solid var(--border);
}
header.top h1 {
  margin: 0 0 8px; font-size: 28px; font-weight: 700;
  letter-spacing: -0.5px;
}
header.top h1 .accent { color: var(--acc); }
header.top .module-tag {
  font: 12px ui-monospace, "SF Mono", monospace;
  color: var(--fg-mute); margin: 4px 0;
}
header.top .industry {
  color: var(--fg); font-size: 14px; max-width: 900px;
  margin: 8px 0 0; line-height: 1.55;
}
.dossier-nav {
  margin-top: 16px; display: flex; gap: 8px; flex-wrap: wrap;
}
.dossier-nav a {
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--fg-mute); text-decoration: none; padding: 7px 12px;
  border-radius: 6px; font-size: 12px; font-weight: 500;
}
.dossier-nav a:hover { border-color: var(--acc); color: var(--fg); }
.merkle-bar {
  margin: 20px 32px; padding: 14px 18px;
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 8px; font-size: 13px;
}
.merkle-bar code {
  background: var(--bg-elev); padding: 2px 6px; border-radius: 3px;
  color: var(--acc); font: 12px ui-monospace, "SF Mono", monospace;
  word-break: break-all;
}
.merkle-bar strong { color: var(--fg); }
section.fixtures { padding: 0 32px 24px; }
section.fixtures h2 {
  font-size: 18px; margin: 16px 0;
  color: var(--fg-mute); text-transform: uppercase;
  letter-spacing: 0.5px; font-weight: 600;
}
article.fixture {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: 10px; padding: 18px; margin-bottom: 16px;
}
article.fixture header h3 {
  margin: 0; font-size: 18px; color: var(--acc);
}
article.fixture header p {
  margin: 4px 0 8px; color: var(--fg-mute); font-size: 13px;
}
.rtp {
  background: var(--bg-elev); padding: 8px 12px; border-radius: 6px;
  margin: 10px 0; font-size: 14px; color: var(--green);
}
table.kv {
  width: 100%; border-collapse: collapse; font-size: 13px;
}
table.kv th, table.kv td {
  padding: 6px 10px; text-align: left;
  border-bottom: 1px solid var(--border); vertical-align: top;
}
table.kv th {
  font-weight: 500; color: var(--fg-mute); width: 30%;
  font: 12px ui-monospace, "SF Mono", monospace;
}
table.kv td {
  font: 12px ui-monospace, "SF Mono", monospace;
}
table.kv td pre {
  margin: 0; padding: 6px 8px; background: var(--bg-elev);
  border-radius: 4px; font-size: 11px; max-height: 200px;
  overflow: auto; line-height: 1.5;
}
footer.bot {
  padding: 20px 32px 40px; color: var(--fg-mute); font-size: 12px;
  border-top: 1px solid var(--border); margin-top: 24px;
}
footer.bot code { color: var(--acc); }

/* Index page */
.index-list {
  display: grid; gap: 12px; padding: 24px 32px;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}
.index-list a {
  background: var(--bg-card); border: 1px solid var(--border);
  color: var(--fg); text-decoration: none; padding: 14px 16px;
  border-radius: 8px; transition: border-color 0.15s;
  display: block;
}
.index-list a:hover { border-color: var(--acc); }
.index-list a strong { color: var(--acc); display: block; margin-bottom: 4px; }
.index-list a .meta {
  font-size: 12px; color: var(--fg-mute);
  font: 11px ui-monospace, monospace; margin-top: 6px;
}
.toolbar {
  padding: 16px 32px; display: flex; gap: 12px; align-items: center;
  flex-wrap: wrap; border-bottom: 1px solid var(--border);
}
.toolbar input {
  background: var(--bg-elev); border: 1px solid var(--border);
  color: var(--fg); padding: 8px 12px; border-radius: 6px;
  font: inherit; width: 320px;
}
.toolbar .count {
  color: var(--fg-mute); font-size: 13px; margin-left: auto;
}
"""

INDEX_JS = """
(function() {
  const $s = document.querySelector('#search');
  const $items = document.querySelectorAll('.index-list a');
  const $count = document.querySelector('#count');
  function f() {
    const q = $s.value.toLowerCase().trim();
    let n = 0;
    $items.forEach(a => {
      const hay = a.textContent.toLowerCase();
      const show = !q || hay.includes(q);
      a.style.display = show ? '' : 'none';
      if (show) n++;
    });
    $count.textContent = n;
  }
  $s.addEventListener('input', f);
  $count.textContent = $items.length;
})();
"""


def _kernel_page(d: dict, file_stem: str) -> tuple[str, str]:
    """Return (html_str, sha256_hex)."""
    kernel = d.get("kernel", file_stem)
    module = d.get("module", "")
    industry = d.get("industry_pattern", "")
    merkle = d.get("merkle_root_sha256", "")
    fixtures_count = d.get("fixtures_count", len(d.get("records", [])))
    schema = d.get("schema", "")
    generated = d.get("generated_at_utc", "")

    fixture_html = "\n".join(
        _render_record(r, i) for i, r in enumerate(d.get("records", []))
    )

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_esc(kernel)} — W244 kernel reference</title>
  <style>{CSS_SHARED}</style>
</head>
<body>
  <header class="top">
    <h1>{_esc(kernel)} <span class="accent">kernel</span></h1>
    <div class="module-tag">{_esc(module)}</div>
    <p class="industry">{_esc(industry)}</p>
    <nav class="dossier-nav">
      <a href="index.html">← All kernels</a>
      <a href="../INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a href="../REGULATOR_PORTAL.html">Regulator Portal</a>
      <a href="../CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
    </nav>
  </header>

  <div class="merkle-bar">
    <div><strong>Schema:</strong> <code>{_esc(schema)}</code></div>
    <div><strong>Merkle (SHA-256):</strong> <code>{_esc(merkle)}</code></div>
    <div><strong>Fixtures:</strong> {fixtures_count}</div>
    <div><strong>Generated UTC:</strong> <code>{_esc(generated)}</code></div>
  </div>

  <section class="fixtures">
    <h2>Acceptance fixtures ({fixtures_count})</h2>
    {fixture_html}
  </section>

  <footer class="bot">
    Source: <code>reports/acceptance/{file_stem}.json</code><br>
    Page Merkle (SHA-256 over body): <code>__MERKLE__</code>
  </footer>
</body>
</html>
"""
    body_for_hash = body.replace("__MERKLE__", "")
    digest = hashlib.sha256(body_for_hash.encode("utf-8")).hexdigest()
    body = body.replace("__MERKLE__", digest)
    return body, digest


def _index_page(kernel_files: list[tuple[str, dict]]) -> str:
    """Return index.html listing all kernels."""
    items = []
    for stem, d in sorted(kernel_files, key=lambda t: t[1].get("kernel", t[0])):
        kernel = d.get("kernel", stem)
        industry_short = (d.get("industry_pattern") or "")[:120]
        fixtures = d.get("fixtures_count", 0)
        merkle_short = (d.get("merkle_root_sha256") or "")[:16]
        items.append(f'''
    <a href="{_esc(stem)}.html">
      <strong>{_esc(kernel)}</strong>
      <div>{_esc(industry_short)}{"…" if len(industry_short) >= 120 else ""}</div>
      <div class="meta">{fixtures} fixtures · merkle {_esc(merkle_short)}…</div>
    </a>''')

    body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Kernel reference index — W244</title>
  <style>{CSS_SHARED}</style>
</head>
<body>
  <header class="top">
    <h1>W244 <span class="accent">kernel references</span></h1>
    <p class="industry">
      Per-kernel deep-dive HTML pages. Each card shows industry pattern,
      Merkle root, and full acceptance fixture detail. Click a kernel
      for the full reference.
    </p>
    <nav class="dossier-nav">
      <a href="../INDUSTRY_FIRST_DOSSIER.html">Industry Firsts</a>
      <a href="../REGULATOR_PORTAL.html">Regulator Portal</a>
      <a href="../CLOSED_FORM_PORTFOLIO.html">Closed-Form Portfolio</a>
    </nav>
  </header>

  <div class="toolbar">
    <input id="search" type="search"
           placeholder="Search kernel name / industry…"
           autocomplete="off">
    <span class="count"><span id="count">0</span>
      / {len(items)} visible</span>
  </div>

  <section class="index-list">{"".join(items)}
  </section>

  <footer class="bot">
    Built from: <code>reports/acceptance/*_KERNEL.json</code>
    ({len(items)} kernels)<br>
    Page Merkle (SHA-256 over body): <code>__MERKLE__</code>
  </footer>
  <script>{INDEX_JS}</script>
</body>
</html>
"""
    body_for_hash = body.replace("__MERKLE__", "")
    digest = hashlib.sha256(body_for_hash.encode("utf-8")).hexdigest()
    body = body.replace("__MERKLE__", digest)
    return body


# Files to skip — not real kernels, structural meta artefakti.
SKIP_FILES = {
    "DONE_UNIVERSAL_CLOSURE_KERNEL.json",
    "RUST_PYTHON_PARITY_KERNEL.json",
    "SHOWCASE_GAME_KERNEL.json",
}


def main() -> int:
    files = sorted(ACCEPT.glob("*_KERNEL.json"))
    files = [f for f in files if f.name not in SKIP_FILES]
    if not files:
        print("[kref] no kernel JSONs found")
        return 1

    rendered = []
    page_count = 0
    for f in files:
        try:
            d = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            print(f"[kref] skip {f.name}: {e}")
            continue
        stem = f.stem  # e.g. CHARGE_METER_KERNEL
        if not d.get("records"):
            # Inverse solver / non-standard — still render with whatever we have
            d.setdefault("records", [])
            d.setdefault("fixtures_count", 0)
        html_out, digest = _kernel_page(d, stem)
        out_path = OUT_DIR / f"{stem.lower()}.html"
        out_path.write_text(html_out, encoding="utf-8")
        rendered.append((stem.lower(), d))
        page_count += 1

    index_html = _index_page(rendered)
    (OUT_DIR / "index.html").write_text(index_html, encoding="utf-8")
    page_count += 1

    print(f"[kref] wrote {page_count} HTML pages under "
          f"{OUT_DIR.relative_to(REPO)}")
    print(f"  per-kernel pages:  {len(rendered)}")
    print("  index page:        1")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
