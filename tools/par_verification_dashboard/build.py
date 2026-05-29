"""W6.2 — Build a multi-SWID PAR verification HTML dashboard.

Ingests every operator package ZIP under a directory, extracts each
SWID's MANIFEST.json + cert XML + meta/version.json, then renders an
**offline-first** HTML page with:

* SWID table — game / SWID / topology / RTP target / RTP measured /
  Δ pp / jurisdictions / verdict.
* Filters — game name (substring), jurisdiction, verdict (pass / fail).
* Diff view — pick any two SWIDs from the table and see field-by-field
  delta.
* Manifest viewer — click a row to expand and inspect the embedded
  MANIFEST.json (file → SHA-256 → size).

Design rules:

* Zero CDN dependencies — fonts/colors/JS all inline so the dashboard
  works on air-gapped regulator workstations.
* Deterministic output — same input ZIPs ⇒ byte-identical HTML so the
  page hash can be pinned by the cert-bundle pipeline.
* No timestamps in the rendered body. Provenance lives in the embedded
  manifests, not in the chrome.
"""

from __future__ import annotations

import dataclasses
import html
import json
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Any


# ─── Data model ────────────────────────────────────────────────────────────


@dataclasses.dataclass
class SwidEntry:
    bundle_path: str
    game_id: str
    swid: str
    reels: int | None
    rows: int | None
    target_rtp: float | None
    measured_rtp: float | None
    delta_pp: float | None
    jurisdictions: list[str]
    type_check_passed: bool
    pubkey_fingerprint: str
    epoch: int | None
    manifest_files: list[dict[str, Any]]
    raw_meta: dict[str, Any]

    @property
    def verdict(self) -> str:
        if not self.type_check_passed:
            return "fail"
        if self.delta_pp is None:
            return "unknown"
        # Common ±0.5pp tolerance window for shipping SWIDs.
        return "pass" if abs(self.delta_pp) <= 0.5 else "warn"

    def to_dict(self) -> dict[str, Any]:
        d = dataclasses.asdict(self)
        d["verdict"] = self.verdict
        return d


# ─── Extraction ────────────────────────────────────────────────────────────


_NS = "{urn:slotmath:cert:v3}"


def _extract_one(zip_path: Path) -> SwidEntry | None:
    """Parse one operator-package.zip into a SwidEntry.

    Returns ``None`` if the bundle is missing MANIFEST.json or the cert XML
    (i.e. it isn't a SWID cert bundle and shouldn't show up in the dashboard).
    """
    with zipfile.ZipFile(zip_path) as zf:
        try:
            manifest_raw = zf.read("MANIFEST.json")
        except KeyError:
            return None
        manifest = json.loads(manifest_raw)

        # Locate cert XML by convention: `cert/<game>.<swid>.cert.xml`.
        cert_files = [
            f for f in zf.namelist() if f.startswith("cert/") and f.endswith(".cert.xml")
        ]
        if not cert_files:
            return None
        cert_xml = zf.read(cert_files[0]).decode("utf-8")
        try:
            version_raw = zf.read("meta/version.json")
            version = json.loads(version_raw)
        except KeyError:
            version = {}

    root = ET.fromstring(cert_xml)
    meta_el = root.find(f"{_NS}Meta")
    topology_el = root.find(f"{_NS}Topology")
    rtp_el = root.find(f"{_NS}Rtp")
    type_check_el = root.find(f"{_NS}TypeCheck")
    juris_el = root.find(f"{_NS}Jurisdictions")

    game_id = _text(meta_el, f"{_NS}GameId") or "unknown"
    swid = _text(meta_el, f"{_NS}Swid") or "unknown"
    reels = _int(topology_el, f"{_NS}Reels")
    rows = _int(topology_el, f"{_NS}Rows")
    target = _float(rtp_el, f"{_NS}Target")
    measured = _float(rtp_el, f"{_NS}Measured")
    delta_pp = (
        (measured - target) * 100.0
        if target is not None and measured is not None
        else None
    )
    type_check_passed = _bool(type_check_el, f"{_NS}Passed", default=False)

    jurisdictions: list[str] = []
    if juris_el is not None:
        for j in juris_el.findall(f"{_NS}Jurisdiction"):
            if j.text:
                jurisdictions.append(j.text.strip())

    return SwidEntry(
        bundle_path=str(zip_path),
        game_id=game_id,
        swid=swid,
        reels=reels,
        rows=rows,
        target_rtp=target,
        measured_rtp=measured,
        delta_pp=delta_pp,
        jurisdictions=jurisdictions,
        type_check_passed=type_check_passed,
        pubkey_fingerprint=manifest.get("ed25519_pubkey_fingerprint", ""),
        epoch=manifest.get("epoch"),
        manifest_files=list(manifest.get("files", [])),
        raw_meta=version,
    )


def _text(el: ET.Element | None, tag: str) -> str | None:
    if el is None:
        return None
    sub = el.find(tag)
    if sub is None or sub.text is None:
        return None
    return sub.text.strip()


def _int(el: ET.Element | None, tag: str) -> int | None:
    raw = _text(el, tag)
    if raw is None:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def _float(el: ET.Element | None, tag: str) -> float | None:
    raw = _text(el, tag)
    if raw is None:
        return None
    try:
        return float(raw)
    except ValueError:
        return None


def _bool(el: ET.Element | None, tag: str, *, default: bool) -> bool:
    raw = _text(el, tag)
    if raw is None:
        return default
    return raw.strip().lower() in {"true", "1", "yes"}


# ─── Dataset assembly ──────────────────────────────────────────────────────


def build_dataset(bundles: list[Path]) -> list[SwidEntry]:
    """Parse every bundle into a list of SwidEntry, sorted for determinism."""
    out: list[SwidEntry] = []
    for path in bundles:
        entry = _extract_one(path)
        if entry is not None:
            out.append(entry)
    out.sort(key=lambda e: (e.game_id, e.swid))
    return out


# ─── HTML rendering ────────────────────────────────────────────────────────


_TEMPLATE = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SLOT-MATH-ENGINE — PAR Verification Dashboard</title>
<style>
:root {{
  --bg: #0e1116;
  --panel: #161b22;
  --panel-2: #1b2129;
  --text: #e6e6e6;
  --muted: #9aa4b2;
  --accent: #3fb950;
  --warn: #d29922;
  --fail: #f85149;
  --grid: #2d333b;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  background: var(--bg); color: var(--text);
  font-size: 13px; line-height: 1.5;
}}
header {{
  padding: 20px 28px; border-bottom: 1px solid var(--grid);
  display: flex; align-items: baseline; justify-content: space-between;
}}
header h1 {{
  margin: 0; font-size: 18px; font-weight: 600;
}}
header .meta {{
  color: var(--muted); font-size: 12px;
}}
main {{ padding: 20px 28px; }}
.controls {{
  display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px;
  padding: 12px; background: var(--panel); border-radius: 6px;
}}
.controls label {{ display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); }}
.controls input, .controls select {{
  background: var(--panel-2); color: var(--text);
  border: 1px solid var(--grid); border-radius: 4px;
  padding: 6px 8px; font-family: inherit; font-size: 12px;
}}
table {{
  width: 100%; border-collapse: collapse; background: var(--panel);
  border-radius: 6px; overflow: hidden; font-size: 12px;
}}
th, td {{
  padding: 8px 12px; text-align: left; border-bottom: 1px solid var(--grid);
  vertical-align: top;
}}
th {{
  background: var(--panel-2); font-weight: 600; cursor: pointer;
  user-select: none; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--muted);
}}
tr.row {{ cursor: pointer; }}
tr.row:hover {{ background: var(--panel-2); }}
tr.row.selected {{ background: rgba(63, 185, 80, 0.08); }}
td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
.verdict {{
  display: inline-block; padding: 2px 8px; border-radius: 10px;
  font-weight: 600; font-size: 11px; letter-spacing: 0.04em;
}}
.verdict.pass {{ background: rgba(63, 185, 80, 0.15); color: var(--accent); }}
.verdict.warn {{ background: rgba(210, 153, 34, 0.15); color: var(--warn); }}
.verdict.fail {{ background: rgba(248, 81, 73, 0.15); color: var(--fail); }}
.verdict.unknown {{ background: rgba(154, 164, 178, 0.15); color: var(--muted); }}
.detail {{ margin-top: 18px; padding: 16px; background: var(--panel); border-radius: 6px; }}
.detail h2 {{ margin: 0 0 12px 0; font-size: 14px; }}
.detail pre {{
  background: var(--bg); padding: 12px; border-radius: 4px;
  border: 1px solid var(--grid); overflow-x: auto;
  font-size: 11px; line-height: 1.45; margin: 0;
}}
.diff-row {{ display: flex; gap: 16px; align-items: stretch; }}
.diff-col {{ flex: 1; background: var(--panel-2); padding: 12px; border-radius: 4px; }}
.diff-col h3 {{ margin: 0 0 8px 0; font-size: 12px; color: var(--muted); }}
.diff-table {{ width: 100%; }}
.diff-table td {{ padding: 4px 8px; border-bottom: 1px solid var(--grid); font-size: 11px; }}
.diff-table td.label {{ color: var(--muted); width: 35%; }}
.diff-changed {{ color: var(--warn); font-weight: 600; }}
.footer {{
  padding: 16px 28px; color: var(--muted); font-size: 11px;
  border-top: 1px solid var(--grid);
}}
.kpi-row {{ display: flex; gap: 20px; margin-bottom: 16px; }}
.kpi {{
  flex: 1; padding: 12px 16px; background: var(--panel);
  border-radius: 6px; border-left: 3px solid var(--grid);
}}
.kpi .label {{ font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }}
.kpi .value {{ font-size: 22px; font-weight: 600; margin-top: 4px; }}
.kpi.pass {{ border-left-color: var(--accent); }}
.kpi.warn {{ border-left-color: var(--warn); }}
.kpi.fail {{ border-left-color: var(--fail); }}
</style>
</head>
<body>
<header>
  <h1>SLOT-MATH-ENGINE — PAR Verification Dashboard</h1>
  <div class="meta">{summary_html}</div>
</header>
<main>
  <div class="kpi-row">
    <div class="kpi pass"><div class="label">Pass</div><div class="value" id="kpi-pass">0</div></div>
    <div class="kpi warn"><div class="label">Warn (Δ&gt;0.5pp)</div><div class="value" id="kpi-warn">0</div></div>
    <div class="kpi fail"><div class="label">Fail</div><div class="value" id="kpi-fail">0</div></div>
    <div class="kpi"><div class="label">Total SWIDs</div><div class="value" id="kpi-total">0</div></div>
  </div>
  <div class="controls">
    <label>Game contains
      <input id="filter-game" type="text" placeholder="e.g. fortune">
    </label>
    <label>Jurisdiction
      <select id="filter-juris"><option value="">— any —</option>{juris_options}</select>
    </label>
    <label>Verdict
      <select id="filter-verdict">
        <option value="">— any —</option>
        <option value="pass">pass</option>
        <option value="warn">warn</option>
        <option value="fail">fail</option>
        <option value="unknown">unknown</option>
      </select>
    </label>
    <label>Sort by
      <select id="sort-by">
        <option value="game_id">game_id</option>
        <option value="swid">swid</option>
        <option value="delta_pp">Δ pp</option>
        <option value="target_rtp">target RTP</option>
        <option value="verdict">verdict</option>
      </select>
    </label>
    <label>Diff column A
      <select id="diff-a"><option value="">— pick row —</option></select>
    </label>
    <label>Diff column B
      <select id="diff-b"><option value="">— pick row —</option></select>
    </label>
  </div>
  <table id="swid-table">
    <thead>
      <tr>
        <th>Game</th><th>SWID</th><th>Topology</th>
        <th class="num">Target RTP</th><th class="num">Measured RTP</th><th class="num">Δ pp</th>
        <th>Jurisdictions</th><th>Verdict</th>
      </tr>
    </thead>
    <tbody id="swid-body"></tbody>
  </table>
  <div class="detail" id="detail-panel" hidden>
    <h2 id="detail-title">SWID detail</h2>
    <div id="detail-body"></div>
  </div>
  <div class="detail" id="diff-panel" hidden>
    <h2>Side-by-side diff</h2>
    <div class="diff-row">
      <div class="diff-col"><h3 id="diff-a-title">A</h3><table class="diff-table" id="diff-a-table"></table></div>
      <div class="diff-col"><h3 id="diff-b-title">B</h3><table class="diff-table" id="diff-b-table"></table></div>
    </div>
  </div>
</main>
<div class="footer">
  Generated from <strong>{n}</strong> SWID bundle(s). Embed-only — works offline. No CDN, no network.
</div>
<script>
const DATA = {data_json};

function fmtNum(v, digits) {{
  if (v == null) return "—";
  return Number(v).toFixed(digits);
}}
function clear(el) {{ while (el.firstChild) el.removeChild(el.firstChild); }}
function renderRow(e, idx) {{
  const tr = document.createElement("tr");
  tr.className = "row";
  tr.dataset.idx = String(idx);
  tr.innerHTML = `
    <td>${{e.game_id}}</td>
    <td>${{e.swid}}</td>
    <td>${{e.reels != null ? e.reels + "×" + e.rows : "—"}}</td>
    <td class="num">${{fmtNum(e.target_rtp, 4)}}</td>
    <td class="num">${{fmtNum(e.measured_rtp, 4)}}</td>
    <td class="num">${{fmtNum(e.delta_pp, 4)}}</td>
    <td>${{(e.jurisdictions || []).join(", ")}}</td>
    <td><span class="verdict ${{e.verdict}}">${{e.verdict}}</span></td>`;
  tr.addEventListener("click", () => showDetail(idx, tr));
  return tr;
}}
function showDetail(idx, tr) {{
  const e = DATA[idx];
  const panel = document.getElementById("detail-panel");
  const title = document.getElementById("detail-title");
  const body = document.getElementById("detail-body");
  document.querySelectorAll("tr.row.selected").forEach(r => r.classList.remove("selected"));
  if (tr) tr.classList.add("selected");
  title.textContent = `${{e.game_id}} · ${{e.swid}}`;
  body.innerHTML = `
    <p><strong>Bundle:</strong> ${{e.bundle_path}}</p>
    <p><strong>ed25519 fp:</strong> ${{e.pubkey_fingerprint}} · <strong>epoch:</strong> ${{e.epoch ?? "—"}}</p>
    <p><strong>Manifest files (${{e.manifest_files.length}}):</strong></p>
    <pre>${{(e.manifest_files || []).map(f => `${{f.path.padEnd(60)}} ${{(f.sha256 || "").slice(0,12)}}… (${{f.size_bytes}} B)`).join("\\n")}}</pre>`;
  panel.hidden = false;
}}
function applyFilters() {{
  const g = document.getElementById("filter-game").value.toLowerCase();
  const j = document.getElementById("filter-juris").value;
  const v = document.getElementById("filter-verdict").value;
  const s = document.getElementById("sort-by").value;
  const filtered = DATA.filter(e =>
    (!g || e.game_id.toLowerCase().includes(g)) &&
    (!j || (e.jurisdictions || []).includes(j)) &&
    (!v || e.verdict === v));
  filtered.sort((a, b) => {{
    const va = a[s], vb = b[s];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return va - vb;
    return String(va).localeCompare(String(vb));
  }});
  const tbody = document.getElementById("swid-body");
  clear(tbody);
  for (const e of filtered) {{
    const idx = DATA.indexOf(e);
    tbody.appendChild(renderRow(e, idx));
  }}
  let pass = 0, warn = 0, fail = 0;
  for (const e of filtered) {{
    if (e.verdict === "pass") pass++;
    else if (e.verdict === "warn") warn++;
    else if (e.verdict === "fail") fail++;
  }}
  document.getElementById("kpi-pass").textContent = pass;
  document.getElementById("kpi-warn").textContent = warn;
  document.getElementById("kpi-fail").textContent = fail;
  document.getElementById("kpi-total").textContent = filtered.length;
}}
function fillDiffSelects() {{
  for (const id of ["diff-a", "diff-b"]) {{
    const sel = document.getElementById(id);
    DATA.forEach((e, i) => {{
      const o = document.createElement("option");
      o.value = String(i);
      o.textContent = `${{e.game_id}} / ${{e.swid}}`;
      sel.appendChild(o);
    }});
  }}
}}
function renderDiff() {{
  const ai = document.getElementById("diff-a").value;
  const bi = document.getElementById("diff-b").value;
  if (ai === "" || bi === "") {{
    document.getElementById("diff-panel").hidden = true;
    return;
  }}
  const a = DATA[Number(ai)], b = DATA[Number(bi)];
  document.getElementById("diff-a-title").textContent = `${{a.game_id}} / ${{a.swid}}`;
  document.getElementById("diff-b-title").textContent = `${{b.game_id}} / ${{b.swid}}`;
  const keys = ["game_id", "swid", "reels", "rows", "target_rtp", "measured_rtp",
                "delta_pp", "jurisdictions", "type_check_passed",
                "pubkey_fingerprint", "epoch", "verdict"];
  const ta = document.getElementById("diff-a-table");
  const tb = document.getElementById("diff-b-table");
  clear(ta); clear(tb);
  for (const k of keys) {{
    const av = JSON.stringify(a[k]);
    const bv = JSON.stringify(b[k]);
    const ch = av !== bv ? " diff-changed" : "";
    ta.innerHTML += `<tr><td class="label">${{k}}</td><td class="${{ch}}">${{av}}</td></tr>`;
    tb.innerHTML += `<tr><td class="label">${{k}}</td><td class="${{ch}}">${{bv}}</td></tr>`;
  }}
  document.getElementById("diff-panel").hidden = false;
}}
for (const id of ["filter-game", "filter-juris", "filter-verdict", "sort-by"]) {{
  document.getElementById(id).addEventListener("input", applyFilters);
}}
for (const id of ["diff-a", "diff-b"]) {{
  document.getElementById(id).addEventListener("input", renderDiff);
}}
fillDiffSelects();
applyFilters();
</script>
</body>
</html>
"""


def render_dashboard(entries: list[SwidEntry]) -> str:
    """Render a self-contained HTML dashboard for the given entries."""
    data = [e.to_dict() for e in entries]
    data_json = json.dumps(data, indent=2, sort_keys=True)

    # Aggregate the unique jurisdictions across all bundles.
    juris: set[str] = set()
    for e in entries:
        juris.update(e.jurisdictions)
    juris_options = "".join(
        f'<option value="{html.escape(j)}">{html.escape(j)}</option>'
        for j in sorted(juris)
    )
    summary_html = html.escape(
        f"{len(entries)} bundle(s) · {len(juris)} jurisdiction(s)"
    )

    return _TEMPLATE.format(
        n=len(entries),
        summary_html=summary_html,
        juris_options=juris_options,
        data_json=data_json,
    )


def write_dashboard(bundles: list[Path], out_path: Path) -> Path:
    entries = build_dataset(bundles)
    html_out = render_dashboard(entries)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_out, encoding="utf-8")
    return out_path


__all__ = [
    "SwidEntry",
    "build_dataset",
    "render_dashboard",
    "write_dashboard",
]
